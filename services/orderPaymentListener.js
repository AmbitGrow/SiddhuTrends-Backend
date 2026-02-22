import mongoose from "mongoose";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import OrderIntent from "../models/orderIntent.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import { consumeStock, releaseStock } from "./inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";
import { createOrderFromPayment } from "./orderCreation.service.js";

// Guard against duplicate listener registration on hot reload
if (!global.paymentListenersRegistered) {
  console.log("🔧 Registering payment event listeners...");

/**
 * PAYMENT_VERIFIED Handler
 * Converts OrderIntent → Order atomically
 * Includes retry logic for transient MongoDB errors
 */
paymentEventEmitter.on("PAYMENT_VERIFIED", async (data) => {
  try {
    console.log("=".repeat(60));
    console.log("📦 PAYMENT_VERIFIED EVENT RECEIVED");
    console.log("=".repeat(60));
    console.log("Event data:", JSON.stringify(data, null, 2));

  const { orderIntentId, paymentId, amount, paymentType } = data;

  if (!orderIntentId || !paymentId) {
    console.error("❌ Missing required fields in event data:", { orderIntentId, paymentId });
    return;
  }

  // Retry logic for transient MongoDB errors
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Order creation attempt ${attempt}/${maxRetries}...`);
      const order = await createOrderFromPayment(orderIntentId, paymentId, paymentType);
      console.log("✅ Event listener successfully created order:", order._id.toString());
      return; // Success - exit retry loop
    } catch (error) {
      lastError = error;
      
      // Check if it's a transient error that can be retried
      const isTransientError = 
        error.errorLabelSet?.has('TransientTransactionError') ||
        error.code === 112 || // WriteConflict
        error.code === 11000; // DuplicateKey (might be timing issue)
      
      if (isTransientError && attempt < maxRetries) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000); // Exponential backoff: 100ms, 200ms, 400ms
        console.log(`⚠️ Transient error on attempt ${attempt}, retrying in ${delay}ms...`);
        console.log(`   Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-transient error or max retries reached
      console.error(`❌ Order creation failed after ${attempt} attempts:`, error.message);
      console.error("Stack:", error.stack);
      break;
    }
  }
  
  // If we got here, all retries failed
  if (lastError) {
    console.error("❌ CRITICAL: Order creation failed after all retries");
    console.error("Last error:", lastError.message);
  }
  
  } catch (wrapperError) {
    console.error("❌ CRITICAL: Event handler wrapper error:", wrapperError);
    console.error("Stack:", wrapperError.stack);
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
