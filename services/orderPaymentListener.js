import mongoose from "mongoose";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import OrderIntent from "../models/orderIntent.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import { consumeStock, releaseStock } from "./inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

// Guard against duplicate listener registration on hot reload
if (!global.paymentListenersRegistered) {
  console.log("🔧 Registering payment event listeners...");

/**
 * PAYMENT_VERIFIED Handler
 * Converts OrderIntent → Order atomically
 */
paymentEventEmitter.on("PAYMENT_VERIFIED", async (data) => {
  console.log("📦 PAYMENT_VERIFIED EVENT RECEIVED", data);

  const { orderIntentId, paymentId, amount, paymentType } = data;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1️⃣ Fetch OrderIntent
    const orderIntent = await OrderIntent.findById(orderIntentId).session(session);

    if (!orderIntent) {
      console.error("❌ OrderIntent not found:", orderIntentId);
      await session.abortTransaction();
      return;
    }

    // 2️⃣ Idempotency check — already converted?
    if (orderIntent.status === "CONVERTED") {
      console.log("⚠️ OrderIntent already converted, skipping:", orderIntentId);
      await session.abortTransaction();
      return;
    }

    // 3️⃣ Check if Order already exists (double creation guard)
    const existingOrder = await Order.findOne({ orderIntentId }).session(session);
    if (existingOrder) {
      console.log("⚠️ Order already exists, skipping:", orderIntentId);
      await session.abortTransaction();
      return;
    }

    // 4️⃣ Verify payment amount (Partial COD enforcement)
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment || payment.paymentStatus !== "SUCCESS") {
      console.error("❌ Payment not verified:", paymentId);
      await session.abortTransaction();
      return;
    }

    // For PARTIAL_COD, ensure advance payment was made
    if (paymentType === "PARTIAL_COD" && payment.paidAmount < 199) {
      console.error("❌ Partial COD advance not met:", payment.paidAmount);
      await session.abortTransaction();
      return;
    }

    // 5️⃣ Consume inventory (permanent stock deduction)
    await consumeStock(orderIntent._id, session);

    // 6️⃣ Create Order
    const order = await Order.create([{
      orderIntentId: orderIntent._id,
      userId: orderIntent.userId,
      paymentId: payment._id.toString(),
      finalAmount: orderIntent.totalAmount,
      gstAmount: orderIntent.gstAmount,
      status: "CONFIRMED",
      confirmedAt: new Date()
    }], { session });

    console.log("✅ Order created:", order[0]._id);

    // 7️⃣ Update OrderIntent → CONVERTED
    orderIntent.status = transitionOrderIntent(orderIntent.status, "CONVERTED");
    await orderIntent.save({ session });

    // 8️⃣ Commit transaction
    await session.commitTransaction();

    console.log("✅ Order conversion successful:", order[0]._id);

  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Order conversion failed:", error);

    // TODO: Add to dead letter queue or alert system
    // This is a critical failure — payment captured but order not created

  } finally {
    session.endSession();
  }
});

/**
 * PAYMENT_FAILED Handler
 * Releases inventory reservations
 */
paymentEventEmitter.on("PAYMENT_FAILED", async (data) => {
  console.log("🚨 PAYMENT_FAILED EVENT RECEIVED", data);

  const { orderIntentId } = data;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1️⃣ Fetch OrderIntent
    const orderIntent = await OrderIntent.findById(orderIntentId).session(session);

    if (!orderIntent) {
      console.error("❌ OrderIntent not found:", orderIntentId);
      await session.abortTransaction();
      return;
    }

    // 2️⃣ If already converted, DO NOT release stock (order is real)
    if (orderIntent.status === "CONVERTED") {
      console.log("⚠️ OrderIntent already converted, not releasing stock:", orderIntentId);
      await session.abortTransaction();
      return;
    }

    // 3️⃣ If already cancelled or expired, skip
    if (["CANCELLED", "EXPIRED"].includes(orderIntent.status)) {
      console.log("⚠️ OrderIntent already terminated:", orderIntent.status);
      await session.abortTransaction();
      return;
    }

    // 4️⃣ Release inventory reservations
    await releaseStock(orderIntent._id, session);

    // 5️⃣ Update OrderIntent → CANCELLED
    orderIntent.status = transitionOrderIntent(orderIntent.status, "CANCELLED");
    await orderIntent.save({ session });

    // 6️⃣ Commit transaction
    await session.commitTransaction();

    console.log("✅ Stock released and OrderIntent cancelled:", orderIntentId);

  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Payment failure handling failed:", error);

  } finally {
    session.endSession();
  }
});

  global.paymentListenersRegistered = true;
  console.log("✅ Payment event listeners registered successfully");
}
