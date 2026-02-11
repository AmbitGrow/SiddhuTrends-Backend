import { paymentEventEmitter } from "../utils/paymentEvents.js";

paymentEventEmitter.on("PAYMENT_VERIFIED", async (data) => {
  console.log("📦 EVENT RECEIVED IN ORDER LISTENER", data);

  // Later:
  // -> Validate OrderIntent
  // -> Create Order
  // -> Reserve stock
  // -> Update OrderIntent -> CONVERTED
});
