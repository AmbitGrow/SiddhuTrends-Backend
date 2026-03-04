import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import { transitionOrder } from "../domain/order.state.js";
import { restockOnCancel } from "../services/inventory.service.js";
import { logPaymentAudit } from "../utils/paymentAuditLogger.js";
import razorpay from "../config/razorpay.js";

/**
 * CANCEL ORDER (Admin only — before shipping)
 * Restocks inventory atomically
 */
export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }

    // State machine validates only CONFIRMED can be cancelled
    const newStatus = transitionOrder(order.status, "CANCELLED");

    // Restock inventory ONLY if it was consumed
    if (order.inventoryConsumed) {
      await restockOnCancel(order, session);
      order.inventoryConsumed = false;
      console.log(`📦 Stock restored for order ${order.orderNumber}`);
    } else {
      console.log(`⚠️ Inventory was never consumed for order ${order.orderNumber}, skipping restock`);
    }

    // Update order
    order.status = newStatus;
    order.cancelledAt = new Date();
    order.cancelReason = reason || "Cancelled by admin";
    await order.save({ session });

    await session.commitTransaction();

    console.log(`✅ Order ${order.orderNumber} cancelled, stock restored`);

    return res.json({
      message: "Order cancelled and stock restored",
      orderNumber: order.orderNumber,
      status: order.status,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Cancel Order Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ 
        message: "Order can only be cancelled before shipping" 
      });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * GET ALL ORDERS (Admin)
 */
export const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .sort({ confirmedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("userId", "name email phone");

    const total = await Order.countDocuments(filter);

    return res.json({
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get All Orders Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET ORDER BY ID (Admin)
 */
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("userId", "name email phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("Get Order Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * UPDATE ORDER STATUS (Admin — ship/deliver)
 * DELIVERED gate: order.amountDue must be 0 (all payments collected)
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 🚫 DELIVERED gate: customer must have paid fully
    if (status === "DELIVERED" && order.amountDue > 0) {
      return res.status(400).json({
        message: `Cannot mark as DELIVERED — ₹${order.amountDue} still due. Collect COD payment first.`,
        amountDue: order.amountDue,
        paidAmount: order.paidAmount,
        finalAmount: order.finalAmount
      });
    }

    const newStatus = transitionOrder(order.status, status);
    order.status = newStatus;

    if (newStatus === "DELIVERED") {
      order.deliveredAt = new Date();
    }

    await order.save();

    return res.json({
      message: `Order status updated to ${newStatus}`,
      orderNumber: order.orderNumber,
      status: order.status
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  }
};

/**
 * COLLECT COD PAYMENT (Admin — when delivery boy collects cash)
 * Updates paidAmount and sets amountDue to 0
 * Must be done BEFORE marking order as DELIVERED
 */
export const collectCOD = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { collectedAmount } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderType !== "PARTIAL_COD") {
      return res.status(400).json({
        message: "COD collection only applies to PARTIAL_COD orders"
      });
    }

    if (order.amountDue === 0) {
      return res.status(400).json({
        message: "COD already collected — amount due is ₹0"
      });
    }

    if (order.status !== "SHIPPED") {
      return res.status(400).json({
        message: `COD can only be collected for SHIPPED orders. Current: ${order.status}`
      });
    }

    // Validate collected amount matches what's due
    const expectedCOD = order.amountDue;
    const collected = collectedAmount ?? expectedCOD; // default to full due

    if (collected !== expectedCOD) {
      return res.status(400).json({
        message: `Collected amount (₹${collected}) does not match amount due (₹${expectedCOD})`,
        expectedAmount: expectedCOD
      });
    }

    order.paidAmount += collected;
    order.amountDue = 0;
    order.codCollectedAt = new Date();
    await order.save();

    console.log(`💵 COD ₹${collected} collected for order ${order.orderNumber}`);

    return res.json({
      message: `COD payment of ₹${collected} collected successfully`,
      orderNumber: order.orderNumber,
      paidAmount: order.paidAmount,
      amountDue: order.amountDue,
      finalAmount: order.finalAmount
    });
  } catch (error) {
    console.error("Collect COD Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * INITIATE REFUND (Admin)
 * Works from CONFIRMED or DELIVERED:
 *   - CONFIRMED: refund only what customer paid online (₹199 for PARTIAL_COD, full for ONLINE) + restock
 *   - DELIVERED: refund full finalAmount (customer already paid everything)
 * Calls Razorpay refund API
 */
export const initiateRefund = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }

    // 1️⃣ State machine: CONFIRMED or DELIVERED → REFUND_INITIATED
    const previousStatus = order.status;
    const newStatus = transitionOrder(order.status, "REFUND_INITIATED");

    // 2️⃣ Fetch payment record
    const payment = await Payment.findById(order.paymentId).session(session);
    if (!payment) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Payment record not found" });
    }

    // 3️⃣ Idempotency: if refund already requested or processed, block
    if (payment.refundStatus === "REQUESTED") {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Refund already initiated, waiting for processing" 
      });
    }
    if (payment.refundStatus === "PROCESSED") {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "Refund already processed" 
      });
    }

    // Validate we have the Razorpay payment ID
    if (!payment.gatewayPaymentId) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: "No Razorpay payment ID found — cannot refund" 
      });
    }

    // 💰 Calculate refund amount based on order status at time of refund
    let refundAmount;
    if (previousStatus === "CONFIRMED") {
      // Refund only what customer actually paid online
      // PARTIAL_COD → ₹199 advance, ONLINE → full amount
      refundAmount = payment.paidAmount;
    } else if (previousStatus === "DELIVERED") {
      // Customer already paid everything (online + COD), refund full order
      refundAmount = order.finalAmount;
    } else {
      refundAmount = payment.paidAmount; // fallback
    }

    // Only refund up to what was paid online (can't refund cash via Razorpay)
    const razorpayRefundAmount = Math.min(refundAmount, payment.paidAmount);
    const amountInPaise = Math.round(razorpayRefundAmount * 100);
    const cashRefundDue = refundAmount - razorpayRefundAmount;

    console.log("💸 Initiating refund:", {
      previousStatus,
      orderType: order.orderType,
      totalRefundAmount: refundAmount,
      razorpayRefundAmount,
      cashRefundDue,
      gatewayPaymentId: payment.gatewayPaymentId,
      amountInPaise
    });

    // 4️⃣ Verify payment is captured on Razorpay before refunding
    let razorpayPayment;
    try {
      razorpayPayment = await razorpay.payments.fetch(payment.gatewayPaymentId);
      console.log("📋 Razorpay payment status:", razorpayPayment.status, "| amount:", razorpayPayment.amount);
    } catch (fetchErr) {
      console.error("❌ Failed to fetch payment from Razorpay:", fetchErr);
      return res.status(502).json({ message: "Could not verify payment status with Razorpay" });
    }

    if (razorpayPayment.status !== "captured") {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Payment is not captured (status: ${razorpayPayment.status}). Only captured payments can be refunded.`
      });
    }

    // 5️⃣ Call Razorpay refund API (direct REST call for reliability)
    let razorpayRefund;
    try {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

      const refundRes = await fetch(
        `https://api.razorpay.com/v1/payments/${payment.gatewayPaymentId}/refund`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ amount: amountInPaise })
        }
      );

      const refundBody = await refundRes.json();
      console.log("📋 Razorpay refund response:", refundRes.status, JSON.stringify(refundBody, null, 2));

      if (!refundRes.ok) {
        await session.abortTransaction();
        return res.status(502).json({
          message: "Razorpay refund failed",
          error: refundBody.error?.description || "Unknown Razorpay error"
        });
      }

      razorpayRefund = refundBody;
    } catch (razorpayError) {
      console.error("❌ Razorpay refund API failed:", razorpayError.message, razorpayError.stack);
      await session.abortTransaction();
      return res.status(502).json({ 
        message: "Razorpay refund failed", 
        error: razorpayError.message 
      });
    }

    // 6️⃣ Restock inventory if order was CONFIRMED (not yet delivered to customer)
    if (previousStatus === "CONFIRMED" && order.inventoryConsumed) {
      await restockOnCancel(order, session);
      order.inventoryConsumed = false;
      console.log(`📦 Stock restored for refunded order ${order.orderNumber}`);
    }

    // 7️⃣ Update payment record
    payment.refundStatus = "REQUESTED";
    payment.refundId = razorpayRefund.id;
    payment.refundAmount = refundAmount;
    payment.refundReason = reason || "Admin initiated refund";
    payment.refundInitiatedAt = new Date();
    await payment.save({ session });

    await logPaymentAudit({
      payment,
      fromStatus: "NONE",
      toStatus: "REQUESTED",
      source: "ADMIN_REFUND"
    });

    // 8️⃣ Update order status
    order.status = newStatus;
    order.refundReason = reason || "Admin initiated refund";
    order.refundInitiatedAt = new Date();
    await order.save({ session });

    await session.commitTransaction();

    console.log(`💸 Refund initiated for order ${order.orderNumber}, Razorpay refund ID: ${razorpayRefund.id}`);

    const responseData = {
      message: "Refund initiated successfully",
      orderNumber: order.orderNumber,
      previousStatus,
      status: order.status,
      refundId: razorpayRefund.id,
      razorpayRefundAmount: razorpayRefundAmount,
      totalRefundAmount: refundAmount,
      note: "Razorpay will process online refund in 5-7 business days"
    };

    // If DELIVERED + PARTIAL_COD, admin needs to manually refund the cash portion
    if (cashRefundDue > 0) {
      responseData.cashRefundDue = cashRefundDue;
      responseData.cashNote = `₹${cashRefundDue} was collected as cash (COD). Please refund this manually to the customer.`;
    }

    return res.json(responseData);

  } catch (error) {
    await session.abortTransaction();
    console.error("Initiate Refund Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * CONFIRM REFUND (Admin or Webhook callback)
 * Called after Razorpay confirms refund is processed
 * REFUND_INITIATED → REFUNDED
 */
export const confirmRefund = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // State machine: only REFUND_INITIATED → REFUNDED
    const newStatus = transitionOrder(order.status, "REFUNDED");

    const payment = await Payment.findById(order.paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    // Idempotency: already refunded
    if (payment.refundStatus === "PROCESSED") {
      return res.json({ 
        message: "Refund already confirmed",
        orderNumber: order.orderNumber,
        status: order.status
      });
    }

    // Verify with Razorpay that refund is actually processed
    if (payment.refundId) {
      try {
        const refundDetails = await razorpay.refunds.fetch(payment.refundId);
        if (refundDetails.status !== "processed") {
          return res.status(400).json({ 
            message: `Refund not yet processed by Razorpay. Current status: ${refundDetails.status}` 
          });
        }
      } catch (err) {
        console.error("⚠️ Could not verify refund status with Razorpay:", err.message);
        // Continue if admin confirms manually
      }
    }

    // Update payment
    payment.refundStatus = "PROCESSED";
    payment.refundProcessedAt = new Date();
    await payment.save();

    await logPaymentAudit({
      payment,
      fromStatus: "REQUESTED",
      toStatus: "PROCESSED",
      source: "ADMIN_CONFIRM_REFUND"
    });

    // Update order
    order.status = newStatus;
    order.refundedAt = new Date();
    await order.save();

    console.log(`✅ Refund confirmed for order ${order.orderNumber}`);

    return res.json({
      message: "Refund confirmed",
      orderNumber: order.orderNumber,
      status: order.status,
      refundedAt: order.refundedAt
    });

  } catch (error) {
    console.error("Confirm Refund Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  }
};