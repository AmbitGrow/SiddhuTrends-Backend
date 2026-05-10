import {
  transitionOrder,
  cancelOrder,
  markShipped,
  markDelivered,
  initiateRefund,
  completeRefund
} from "../modules/orders/order.service.js";
import { canTransition } from "../modules/orders/order.state.js";

import OrderLog from "../models/orderLog.model.js";
import { orderEventEmitter } from "../utils/orderEvents.js";

export const emitOrderLifecycleEvent = (event, payload) => {
  setImmediate(() => {
    try {
      orderEventEmitter.emit(event, payload);
    } catch (error) {
      console.error(`Failed to emit ${event}:`, error.message);
    }
  });
};

export const logOrderAuditEntry = async ({
  order,
  fromStatus,
  toStatus,
  action,
  changedBy = null,
  reason = null,
  metadata = {},
  session = null
}) => {
  const actor = changedBy ? "ADMIN" : "SYSTEM";
  const auditDoc = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    fromStatus,
    toStatus,
    changedBy: actor,
    reason
  };

  if (session) {
    await OrderLog.create([auditDoc], { session });
    return;
  }

  await OrderLog.create(auditDoc);
};

export const transitionOrderStatus = ({ currentStatus, nextStatus }) => {
  if (!canTransition(currentStatus, nextStatus)) {
    throw new Error(`Invalid Order transition: ${currentStatus} → ${nextStatus}`);
  }
  return nextStatus;
};

export const approveCancelDecision = async ({
  order,
  reason,
  adminId,
  requirePendingRequest = false,
  session
}) => {
  if (requirePendingRequest && order.cancelRequest?.status !== "PENDING") {
    throw new Error("No pending cancellation request to approve");
  }

  const updated = await cancelOrder({
    orderId: order._id,
    session,
    metadata: { location: "Admin Panel" },
    changedBy: adminId,
    reason
  });

  return { fromStatus: "CONFIRMED", toStatus: updated.status };
};

export const rejectRequestDecision = async ({
  order,
  requestType,
  reason,
  adminId,
  session
}) => {
  if (!["cancel", "refund"].includes(requestType)) {
    throw new Error("Invalid request type");
  }

  if (requestType === "cancel" && order.cancelRequest?.status !== "PENDING") {
    throw new Error("No pending cancellation request to reject");
  }

  if (requestType === "refund" && order.refundRequest?.status !== "PENDING") {
    throw new Error("No pending refund request to reject");
  }

  if (requestType === "cancel") {
    order.cancelRequest.status = "REJECTED";
    order.cancelRequest.reviewedAt = new Date();
    order.cancelRequest.reviewedBy = adminId || null;
    order.cancelRequest.adminNote = reason;
  } else {
    order.refundRequest.status = "REJECTED";
    order.refundRequest.reviewedAt = new Date();
    order.refundRequest.reviewedBy = adminId || null;
    order.refundRequest.adminNote = reason;
  }

  await order.save({ session });

  await logOrderAuditEntry({
    order,
    fromStatus: order.status,
    toStatus: order.status,
    action: requestType === "cancel" ? "CANCEL_REQUEST_REJECTED" : "REFUND_REQUEST_REJECTED",
    changedBy: adminId,
    reason,
    session
  });
};

export const applyRefundTransition = async ({
  order,
  reason,
  adminId,
  session,
  requirePendingRequest = false
}) => {
  if (requirePendingRequest && order.refundRequest?.status !== "PENDING") {
    throw new Error("No pending refund request to approve");
  }

  const updated = await initiateRefund({
    orderId: order._id,
    session,
    metadata: { location: "Admin Panel" },
    changedBy: adminId,
    reason
  });

  if (updated.refundRequest?.status === "PENDING") {
    updated.refundRequest.status = "APPROVED";
    updated.refundRequest.reviewedAt = new Date();
    updated.refundRequest.reviewedBy = adminId || null;
    updated.refundRequest.adminNote = reason || "Refund approved by admin";
    await updated.save({ session });
  }

  return { fromStatus: order.status, toStatus: updated.status };
};

export { markShipped, markDelivered, completeRefund };
