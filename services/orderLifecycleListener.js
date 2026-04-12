import { orderEventEmitter } from "../utils/orderEvents.js";
import {
  notifyOrderConfirmed,
  notifyOrderShipped,
  notifyOrderDelivered,
  notifyOrderCancelled,
  notifyOrderRefunded,
  notifyRefundInitiated
} from "../services/notification.service.js";
import { trackOrderEvent } from "../services/analytics.service.js";

if (!global.orderLifecycleListenersRegistered) {
  console.log("🔧 Registering order lifecycle listeners...");

  orderEventEmitter.on("ORDER_CONFIRMED", async (payload) => {
    console.log("📣 ORDER_CONFIRMED", payload);
    await notifyOrderConfirmed(payload);
    await trackOrderEvent("ORDER_CONFIRMED", payload);
  });

  orderEventEmitter.on("ORDER_SHIPPED", async (payload) => {
    console.log("📣 ORDER_SHIPPED", payload);
    await notifyOrderShipped(payload);
    await trackOrderEvent("ORDER_SHIPPED", payload);
  });

  orderEventEmitter.on("ORDER_DELIVERED", async (payload) => {
    console.log("📣 ORDER_DELIVERED", payload);
    await notifyOrderDelivered(payload);
    await trackOrderEvent("ORDER_DELIVERED", payload);
  });

  orderEventEmitter.on("ORDER_CANCELLED", async (payload) => {
    console.log("📣 ORDER_CANCELLED", payload);
    await notifyOrderCancelled(payload);
    await trackOrderEvent("ORDER_CANCELLED", payload);
  });

  orderEventEmitter.on("ORDER_REFUND_INITIATED", async (payload) => {
    console.log("📣 ORDER_REFUND_INITIATED", payload);
    await notifyRefundInitiated(payload);
    await trackOrderEvent("ORDER_REFUND_INITIATED", payload);
  });

  orderEventEmitter.on("ORDER_REFUNDED", async (payload) => {
    console.log("📣 ORDER_REFUNDED", payload);
    await notifyOrderRefunded(payload);
    await trackOrderEvent("ORDER_REFUNDED", payload);
  });

  orderEventEmitter.on("ORDER_CANCEL_REQUEST_REJECTED", async (payload) => {
    console.log("📣 ORDER_CANCEL_REQUEST_REJECTED", payload);
  });

  orderEventEmitter.on("ORDER_REFUND_REQUEST_REJECTED", async (payload) => {
    console.log("📣 ORDER_REFUND_REQUEST_REJECTED", payload);
  });

  global.orderLifecycleListenersRegistered = true;
  console.log("✅ Order lifecycle listeners registered successfully");
}
