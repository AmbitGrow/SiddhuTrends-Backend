import crypto from "crypto";
import razorpay from "../config/razorpay.js";
import Payment from "../models/payment.model.js";
import OrderIntent from "../models/orderIntent.model.js"; // assumed
import WebhookEvent from "../models/webhookEvent.model.js";
import { logPaymentAudit } from "../utils/paymentAuditLogger.js";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

const ADVANCE_AMOUNT = 199; // fixed advance (LOCKED)

export const initiatePayment = async (req, res) => {
  try {
    const { orderIntentId } = req.params;
    const { paymentType } = req.body;

    if (!paymentType || !["ONLINE", "PARTIAL_COD"].includes(paymentType)) {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    // 1️⃣ Fetch OrderIntent
    const orderIntent = await OrderIntent.findById(orderIntentId);
    if (!orderIntent) {
      return res.status(404).json({ message: "OrderIntent not found" });
    }

    // 1.5️⃣ Check OrderIntent is RESERVED
    if (orderIntent.status !== "RESERVED") {
      return res.status(400).json({
        message: `Order is not ready for payment. Current status: ${orderIntent.status}`
      });
    }

    // 2️⃣ Prevent duplicate payment
    const existingPayment = await Payment.findOne({ orderIntentId });
    if (existingPayment) {
      return res.status(400).json({
        message: "Payment already initiated for this order"
      });
    }

    // 3️⃣ Decide expected amount
    const expectedAmount =
      paymentType === "PARTIAL_COD"
        ? ADVANCE_AMOUNT
        : orderIntent.totalAmount;

    const expectedAmountNumber = Number(expectedAmount);
    if (Number.isNaN(expectedAmountNumber)) {
      throw new Error("Invalid payment amount");
    }

    const razorpayAmount = Math.round(expectedAmountNumber * 100);
    if (!razorpayAmount || razorpayAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    // Temporary sanity log to catch upstream issues quickly
    console.log("Expected amount (₹):", expectedAmountNumber);
    console.log("Razorpay amount (paise):", razorpayAmount);

    // 4️⃣ Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: razorpayAmount, // Razorpay expects paise
      currency: "INR",
      receipt: `order_intent_${orderIntent._id}`,
      notes: {
        orderIntentId: orderIntent._id.toString(),
        paymentType
      }
    });

    // 5️⃣ Create Payment record
    const newPayment = await Payment.create({
      orderIntentId,
      paymentType,
      gatewayOrderId: razorpayOrder.id,
      expectedAmount: expectedAmountNumber,
      paymentStatus: "PENDING"
    });

    await logPaymentAudit({
      payment: newPayment,
      fromStatus: null,
      toStatus: "PENDING",
      source: "INITIATE_API"
    });

    // 5.5️⃣ Transition OrderIntent to PAYMENT_IN_PROGRESS
    orderIntent.status = transitionOrderIntent(
      orderIntent.status,
      "PAYMENT_IN_PROGRESS"
    );
    await orderIntent.save();

    // 6️⃣ Send payload to frontend
    return res.json({
      razorpayOrderId: razorpayOrder.id,
      amount: expectedAmount,
      currency: "INR",
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Initiate Payment Error:", error);
    res.status(500).json({ message: "Failed to initiate payment" });
  }
};

const verifyPaymentInternal = async (
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature = null // webhook may not send signature
) => {

  const payment = await Payment.findOne({
    gatewayOrderId: razorpay_order_id
  });

  if (!payment) {
    throw new Error("Payment record not found");
  }

  if (payment.paymentStatus === "SUCCESS") {
    return payment;
  }

  if (payment.paymentStatus === "FAILED") {
    throw new Error("Payment already failed");
  }

  // If signature provided → verify (API call case)
  if (razorpay_signature) {
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      payment.paymentStatus = "FAILED";
      await payment.save();
      await logPaymentAudit({
        payment,
        fromStatus: "PENDING",
        toStatus: "FAILED",
        source: "VERIFY_API"
      });
      
      console.log("🚨 Emitting PAYMENT_FAILED event (signature mismatch)");
      paymentEventEmitter.emit("PAYMENT_FAILED", {
        orderIntentId: payment.orderIntentId.toString()
      });
      
      throw new Error("Invalid payment signature");
    }
  }

  // Fetch from Razorpay
  const razorpayPayment = await razorpay.payments.fetch(
    razorpay_payment_id
  );

  if (!razorpayPayment || razorpayPayment.status !== "captured") {
    payment.paymentStatus = "FAILED";
    await payment.save();
    await logPaymentAudit({
      payment,
      fromStatus: "PENDING",
      toStatus: "FAILED",
      source: razorpay_signature ? "VERIFY_API" : "WEBHOOK"
    });
    
    console.log("🚨 Emitting PAYMENT_FAILED event (not captured)");
    paymentEventEmitter.emit("PAYMENT_FAILED", {
      orderIntentId: payment.orderIntentId.toString()
    });
    
    throw new Error("Payment not captured");
  }

  const paidAmount = razorpayPayment.amount / 100;

  if (paidAmount !== payment.expectedAmount) {
    payment.paymentStatus = "FAILED";
    await payment.save();
    await logPaymentAudit({
      payment,
      fromStatus: "PENDING",
      toStatus: "FAILED",
      source: razorpay_signature ? "VERIFY_API" : "WEBHOOK"
    });
    
    console.log("🚨 Emitting PAYMENT_FAILED event (amount mismatch)");
    paymentEventEmitter.emit("PAYMENT_FAILED", {
      orderIntentId: payment.orderIntentId.toString()
    });
    
    throw new Error("Payment amount mismatch");
  }

  payment.gatewayPaymentId = razorpay_payment_id;
  payment.paidAmount = paidAmount;
  payment.paymentStatus = "SUCCESS";
  payment.verifiedAt = new Date();

  await payment.save();

  await logPaymentAudit({
    payment,
    fromStatus: "PENDING",
    toStatus: "SUCCESS",
    source: razorpay_signature ? "VERIFY_API" : "WEBHOOK"
  });

  console.log("PAYMENT_VERIFIED", {
    orderIntentId: payment.orderIntentId.toString(),
    amount: paidAmount,
    paymentType: payment.paymentType
  });

  console.log("🚀 Emitting PAYMENT_VERIFIED event");
  paymentEventEmitter.emit("PAYMENT_VERIFIED", {
    orderIntentId: payment.orderIntentId.toString(),
    paymentId: payment._id.toString(),
    amount: payment.paidAmount,
    paymentType: payment.paymentType
  });

  return payment;
};


export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        message: "Missing payment verification fields"
      });
    }

    await verifyPaymentInternal(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    return res.json({
      message: "Payment verified successfully"
    });

  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({
      message: "Payment verification failed"
    });
  }
};


export const razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const receivedSignature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];
    if (!eventId) {
      return res.status(400).json({ message: "Missing event id" });
    }

    const existingEvent = await WebhookEvent.findOne({ eventId });
    if (existingEvent) {
      console.log("Duplicate webhook ignored:", eventId);
      return res.json({ status: "duplicate_ignored" });
    }

    if (!secret || !receivedSignature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const body = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== receivedSignature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = JSON.parse(body.toString());
    const paymentEntity = event.payload.payment.entity;

    const razorpay_order_id = paymentEntity.order_id;
    const razorpay_payment_id = paymentEntity.id;

    if (event.event === "payment.captured") {
      // reuse your verification logic
      await verifyPaymentInternal(razorpay_order_id, razorpay_payment_id);
    }

    if (event.event === "payment.failed") {
      console.log("PAYMENT_FAILED webhook event", razorpay_payment_id);
      
      const payment = await Payment.findOne({
        gatewayOrderId: razorpay_order_id
      });
      
      if (payment && payment.paymentStatus !== "SUCCESS") {
        payment.paymentStatus = "FAILED";
        await payment.save();
        
        console.log("🚨 Emitting PAYMENT_FAILED event (webhook failure)");
        paymentEventEmitter.emit("PAYMENT_FAILED", {
          orderIntentId: payment.orderIntentId.toString()
        });
      }
    }

    try {
      await WebhookEvent.create({
        eventId,
        eventType: event.event
      });
    } catch (err) {
      if (err.code === 11000) {
        console.log("Duplicate webhook race condition handled:", eventId);
        return res.json({ status: "duplicate_race_ignored" });
      }
      throw err;
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).json({ message: "Webhook handling failed" });
  }
};
