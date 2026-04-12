import Order from "../../models/order.model.js";
import OrderLog from "../../models/orderLog.model.js";
import { restockOnCancel } from "../../services/inventory.service.js";
import { ORDER_STATES, canTransition } from "./order.state.js";
import { orderEventEmitter } from "./order.events.js";

const saveOrderAudit = async ({
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
  const doc = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    fromStatus,
    toStatus,
    changedBy: actor,
    reason
  };

  if (session) {
    await OrderLog.create([doc], { session });
    return;
  }

  await OrderLog.create(doc);
};

const emitOrderEvent = (eventName, payload) => {
  setImmediate(() => {
    try {
      orderEventEmitter.emit(eventName, payload);
    } catch (error) {
      console.error(`Error emitting ${eventName}:`, error.message);
    }
  });
};

export const transitionOrder = async ({
  orderId,
  toStatus,
  session,
  metadata = {},
  changedBy = null,
  reason = null,
  skipEmit = false
}) => {
  const query = Order.findById(orderId);
  const order = session ? await query.session(session) : await query;

  if (!order) {
    throw new Error("Order not found");
  }

  if (!canTransition(order.status, toStatus)) {
    throw new Error(`Invalid transition from ${order.status} → ${toStatus}`);
  }

  const fromStatus = order.status;
  order.status = toStatus;

  if (toStatus === ORDER_STATES.CONFIRMED && !order.confirmedAt) {
    order.confirmedAt = new Date();
    order.paymentStatus = "SUCCESS";
  }

  if (toStatus === ORDER_STATES.DELIVERED && !order.deliveredAt) {
    order.deliveredAt = new Date();
  }

  if (toStatus === ORDER_STATES.CANCELLED && !order.cancelledAt) {
    order.cancelledAt = new Date();
  }

  if (toStatus === ORDER_STATES.REFUNDED && !order.refundedAt) {
    order.refundedAt = new Date();
    order.paymentStatus = "REFUNDED";
  }

  if (!Array.isArray(order.trackingHistory)) {
    order.trackingHistory = [];
  }

  order.trackingHistory.push({
    status: toStatus,
    location: metadata.location || "System",
    timestamp: new Date()
  });

  await order.save({ session });

  await saveOrderAudit({
    order,
    fromStatus,
    toStatus,
    action: `ORDER_${toStatus}`,
    changedBy,
    reason,
    metadata,
    session
  });

  if (!skipEmit) {
    emitOrderEvent(`ORDER_${toStatus}`, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      fromStatus,
      toStatus,
      metadata
    });
  }

  return order;
};

export const confirmOrder = async ({
  orderId,
  session,
  metadata = {},
  changedBy = null,
  reason = "Order confirmed after payment",
  skipEmit = false
}) => {
  return transitionOrder({
    orderId,
    toStatus: ORDER_STATES.CONFIRMED,
    session,
    metadata,
    changedBy,
    reason,
    skipEmit
  });
};

export const cancelOrder = async ({
  orderId,
  session,
  metadata = {},
  changedBy = null,
  reason = "Cancelled"
}) => {
  const query = Order.findById(orderId);
  const order = session ? await query.session(session) : await query;

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.status !== ORDER_STATES.CONFIRMED) {
    throw new Error("Only CONFIRMED orders can be cancelled");
  }

  if (order.inventoryConsumed) {
    await restockOnCancel(order, session || null);
    order.inventoryConsumed = false;
    await order.save({ session });
  }

  const updatedOrder = await transitionOrder({
    orderId,
    toStatus: ORDER_STATES.CANCELLED,
    session,
    metadata,
    changedBy,
    reason,
    skipEmit: true
  });

  updatedOrder.cancelReason = reason;
  await updatedOrder.save({ session });

  emitOrderEvent("ORDER_CANCELLED", {
    orderId: updatedOrder._id.toString(),
    orderNumber: updatedOrder.orderNumber,
    userId: updatedOrder.userId?.toString(),
    fromStatus: ORDER_STATES.CONFIRMED,
    toStatus: ORDER_STATES.CANCELLED,
    metadata
  });

  return updatedOrder;
};

export const markShipped = async ({
  orderId,
  session,
  metadata = {},
  changedBy = null,
  reason = "Order shipped",
  skipEmit = false
}) => {
  return transitionOrder({
    orderId,
    toStatus: ORDER_STATES.SHIPPED,
    session,
    metadata: {
      location: metadata.location || "Warehouse",
      ...metadata
    },
    changedBy,
    reason,
    skipEmit
  });
};

export const markDelivered = async ({
  orderId,
  session,
  metadata = {},
  changedBy = null,
  reason = "Order delivered",
  skipEmit = false
}) => {
  return transitionOrder({
    orderId,
    toStatus: ORDER_STATES.DELIVERED,
    session,
    metadata: {
      location: metadata.location || "Customer Address",
      ...metadata
    },
    changedBy,
    reason,
    skipEmit
  });
};

export const initiateRefund = async ({
  orderId,
  session,
  metadata = {},
  changedBy = null,
  reason = "Refund initiated",
  skipEmit = false
}) => {
  return transitionOrder({
    orderId,
    toStatus: ORDER_STATES.REFUND_INITIATED,
    session,
    metadata,
    changedBy,
    reason,
    skipEmit
  });
};

export const completeRefund = async ({
  orderId,
  session,
  metadata = {},
  changedBy = null,
  reason = "Refund completed",
  skipEmit = false
}) => {
  const order = await transitionOrder({
    orderId,
    toStatus: ORDER_STATES.REFUNDED,
    session,
    metadata,
    changedBy,
    reason,
    skipEmit: true
  });

  order.paymentStatus = "REFUNDED";
  await order.save({ session });

  if (!skipEmit) {
    emitOrderEvent("ORDER_REFUNDED", {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: order.userId?.toString(),
      metadata
    });
  }

  return order;
};
