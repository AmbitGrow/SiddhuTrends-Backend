import express from "express";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import Payment from "../models/payment.model.js";
import OrderIntent from "../models/orderIntent.model.js";
import Order from "../models/order.model.js";

const router = express.Router();

/**
 * Debug endpoint - Check event listener status
 */
router.get("/event-listeners/status", (req, res) => {
  const listeners = {
    PAYMENT_VERIFIED: paymentEventEmitter.listenerCount("PAYMENT_VERIFIED"),
    PAYMENT_FAILED: paymentEventEmitter.listenerCount("PAYMENT_FAILED"),
    registrationFlag: global.paymentListenersRegistered || false
  };

  res.json({
    message: "Event listener status",
    listeners,
    note: "If counts are 0, listeners are not registered"
  });
});

/**
 * Debug endpoint - Manually trigger PAYMENT_VERIFIED event
 */
router.post("/trigger-payment-event/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    console.log("🧪 MANUALLY TRIGGERING PAYMENT_VERIFIED EVENT");
    console.log("Payment data:", {
      _id: payment._id.toString(),
      orderIntentId: payment.orderIntentId.toString(),
      paymentStatus: payment.paymentStatus,
      paymentType: payment.paymentType,
      paidAmount: payment.paidAmount
    });

    paymentEventEmitter.emit("PAYMENT_VERIFIED", {
      orderIntentId: payment.orderIntentId.toString(),
      paymentId: payment._id.toString(),
      amount: payment.paidAmount,
      paymentType: payment.paymentType
    });

    res.json({
      message: "Event emitted manually",
      payment: {
        _id: payment._id,
        orderIntentId: payment.orderIntentId,
        status: payment.paymentStatus
      },
      note: "Check server console for event processing logs"
    });

  } catch (error) {
    console.error("Error triggering event:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * Debug endpoint - Check order conversion status
 */
router.get("/order-intent/:orderIntentId/status", async (req, res) => {
  try {
    const { orderIntentId } = req.params;
    
    const orderIntent = await OrderIntent.findById(orderIntentId);
    const payment = await Payment.findOne({ orderIntentId });
    const order = await Order.findOne({ orderIntentId });
    
    res.json({
      orderIntent: orderIntent ? {
        _id: orderIntent._id,
        status: orderIntent.status,
        expiresAt: orderIntent.expiresAt,
        totalAmount: orderIntent.totalAmount
      } : null,
      payment: payment ? {
        _id: payment._id,
        paymentStatus: payment.paymentStatus,
        paymentType: payment.paymentType,
        paidAmount: payment.paidAmount,
        expectedAmount: payment.expectedAmount
      } : null,
      order: order ? {
        _id: order._id,
        status: order.status,
        orderNumber: order.orderNumber
      } : null,
      diagnosis: {
        paymentSuccessful: payment?.paymentStatus === "SUCCESS",
        orderCreated: !!order,
        shouldHaveOrder: payment?.paymentStatus === "SUCCESS" && !order,
        issue: payment?.paymentStatus === "SUCCESS" && !order 
          ? "Payment successful but order not created - EVENT LISTENER PROBLEM"
          : null
      }
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
