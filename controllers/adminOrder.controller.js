import mongoose from "mongoose";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import razorpay from "../config/razorpay.js";
import { restockOnCancel } from "../services/inventory.service.js";
import { initiateRefund as initiateGatewayRefund, confirmRefund as confirmGatewayRefund } from "../modules/payments/refund.service.js";
import {
  approveCancelDecision,
  rejectRequestDecision,
  emitOrderLifecycleEvent,
  applyRefundTransition,
  markShipped,
  markDelivered,
  completeRefund
} from "../services/orderLifecycle.service.js";

const initiateCancelRefund = async ({ order, reason, actorId }) => {
  try {
    if (!order.paymentId || !order.paidAmount || order.paidAmount <= 0) {
      return { initiated: false, message: "No paid amount to refund" };
    }

    const refundAmount = Math.min(order.paidAmount, order.finalAmount);

    const { payment, refund, alreadyRequested, alreadyProcessed } = await initiateGatewayRefund({
      paymentId: order.paymentId,
      orderId: order._id,
      refundAmount,
      reason: reason || "Cancellation approved",
      session: null
    });

    if (alreadyRequested || alreadyProcessed) {
      return { initiated: false, message: "Refund already requested/processed" };
    }

    order.refundReason = reason || "Cancellation approved";
    order.refundInitiatedAt = new Date();
    await order.save();

    await emitOrderLifecycleEvent("ORDER_REFUND_INITIATED", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      status: order.status,
      refundId: refund.id,
      refundAmount,
      initiatedFrom: "CANCEL_APPROVAL"
    });

    await logOrderAuditEntry({
      order,
      fromStatus: order.status,
      toStatus: order.status,
      action: "CANCEL_REFUND_INITIATED",
      changedBy: actorId || null,
      reason: reason || "Cancellation approved"
    });

    return {
      initiated: true,
      refundId: refund.id,
      refundAmount
    };
  } catch (error) {
    console.error("Cancel refund initiation failed:", error.message);
    return { initiated: false, message: error.message };
  }
};

/**
 * CANCEL ORDER (Admin only — before shipping)
 * Restocks inventory atomically
 */
export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();
  const isApprovalMode = req.approvalMode === true;

  try {
    session.startTransaction();

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }

    const { fromStatus } = await approveCancelDecision({
      order,
      reason,
      adminId: req.user?._id,
      requirePendingRequest: isApprovalMode,
      session
    });

    await session.commitTransaction();

    await emitOrderLifecycleEvent("ORDER_CANCELLED", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      fromStatus,
      toStatus: order.status,
      reason: reason || "Cancelled by admin"
    });

    const refundResult = await initiateCancelRefund({
      order,
      reason,
      actorId: req.user?._id
    });

    console.log(`✅ Order ${order.orderNumber} cancelled, stock restored`);

    return res.json({
      message: "Order cancelled and stock restored",
      orderNumber: order.orderNumber,
      status: order.status,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      refund: refundResult
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Cancel Order Error:", error);

    if (error.message.includes("No pending cancellation request")) {
      return res.status(400).json({ message: error.message });
    }

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
 * APPROVE CANCEL REQUEST (Admin)
 */
export const approveCancelRequest = async (req, res) => {
  req.approvalMode = true;
  return cancelOrder(req, res);
};

/**
 * REJECT CANCEL REQUEST (Admin)
 */
export const rejectCancelRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    await rejectRequestDecision({
      order,
      requestType: "cancel",
      reason,
      adminId: req.user?._id
    });

    await emitOrderLifecycleEvent("ORDER_CANCEL_REQUEST_REJECTED", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      reason
    });

    return res.json({
      message: "Cancellation request rejected",
      orderNumber: order.orderNumber,
      requestStatus: order.cancelRequest.status
    });
  } catch (error) {
    console.error("Reject Cancel Request Error:", error);

    if (error.message.includes("No pending cancellation request")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
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

    let updatedOrder = null;

    if (status === "SHIPPED") {
      updatedOrder = await markShipped({
        orderId,
        metadata: {
          location: "Warehouse",
          finalAmount: order.finalAmount,
          xpEarned: order.xpEarned || 0
        },
        changedBy: req.user?._id,
        reason: "Admin marked order as shipped"
      });
    } else if (status === "DELIVERED") {
      updatedOrder = await markDelivered({
        orderId,
        metadata: {
          location: "Customer Address",
          finalAmount: order.finalAmount,
          xpEarned: order.xpEarned || 0
        },
        changedBy: req.user?._id,
        reason: "Admin marked order as delivered"
      });
    } else {
      return res.status(400).json({
        message: "Only SHIPPED and DELIVERED status updates are supported via this endpoint"
      });
    }

    return res.json({
      message: `Order status updated to ${updatedOrder.status}`,
      orderNumber: updatedOrder.orderNumber,
      status: updatedOrder.status
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
  const isApprovalMode = req.approvalMode === true;

  try {
    session.startTransaction();

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }

    // 1️⃣ Capture previous status for refund strategy
    const previousStatus = order.status;

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
      const result = await initiateGatewayRefund({
        paymentId: payment._id,
        orderId: order._id,
        refundAmount: razorpayRefundAmount,
        reason: reason || "Admin initiated refund",
        session
      });

      if (result.alreadyRequested || result.alreadyProcessed) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "Refund already initiated or processed"
        });
      }

      razorpayRefund = result.refund;
    } catch (razorpayError) {
      console.error("❌ Razorpay refund API failed:", razorpayError.message, razorpayError.stack);
      await session.abortTransaction();
      return res.status(502).json({ 
        message: "Razorpay refund failed", 
        error: razorpayError.message 
      });
    }

    // 6️⃣ Restock inventory if order was CONFIRMED (not yet delivered)
    if (previousStatus === "CONFIRMED" && order.inventoryConsumed) {
      await restockOnCancel(order, session);
      order.inventoryConsumed = false;
      console.log(`📦 Stock restored for refunded order ${order.orderNumber}`);
    }

    // payment record updated inside refund service

    // 8️⃣ Update order status via centralized lifecycle transition
    const { toStatus } = await applyRefundTransition({
      order,
      reason,
      adminId: req.user?._id,
      session,
      requirePendingRequest: isApprovalMode
    });

    await session.commitTransaction();

    await emitOrderLifecycleEvent("ORDER_REFUND_INITIATED", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      status: toStatus,
      refundId: razorpayRefund.id,
      refundAmount
    });

    console.log(`💸 Refund initiated for order ${order.orderNumber}, Razorpay refund ID: ${razorpayRefund.id}`);

    const responseData = {
      message: "Refund initiated successfully",
      orderNumber: order.orderNumber,
      previousStatus,
      status: order.status,
      refundId: razorpayRefund?.id,
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

    if (error.message.includes("No pending refund request")) {
      return res.status(400).json({ message: error.message });
    }

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * APPROVE REFUND REQUEST (Admin)
 */
export const approveRefundRequest = async (req, res) => {
  req.approvalMode = true;
  return initiateRefund(req, res);
};

/**
 * REJECT REFUND REQUEST (Admin)
 */
export const rejectRefundRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    await rejectRequestDecision({
      order,
      requestType: "refund",
      reason,
      adminId: req.user?._id
    });

    await emitOrderLifecycleEvent("ORDER_REFUND_REQUEST_REJECTED", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      reason
    });

    return res.json({
      message: "Refund request rejected",
      orderNumber: order.orderNumber,
      requestStatus: order.refundRequest.status
    });
  } catch (error) {
    console.error("Reject Refund Request Error:", error);

    if (error.message.includes("No pending refund request")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
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

    const payment = await Payment.findById(order.paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    const confirmResult = await confirmGatewayRefund({
      paymentId: payment._id,
      session: null
    });

    if (confirmResult.alreadyProcessed) {
      return res.json({ 
        message: "Refund already confirmed",
        orderNumber: order.orderNumber,
        status: order.status
      });
    }

    const updatedOrder = await completeRefund({
      orderId,
      changedBy: req.user?._id,
      reason: "Refund confirmed",
      metadata: { location: "System" }
    });

    console.log(`✅ Refund confirmed for order ${updatedOrder.orderNumber}`);

    return res.json({
      message: "Refund confirmed",
      orderNumber: updatedOrder.orderNumber,
      status: updatedOrder.status,
      refundedAt: updatedOrder.refundedAt
    });

  } catch (error) {
    console.error("Confirm Refund Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  }
};