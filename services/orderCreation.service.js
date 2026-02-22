import mongoose from "mongoose";
import OrderIntent from "../models/orderIntent.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import { consumeStock } from "./inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";
import generateOrderNumber from "../utils/generateOrderNumber.js";

/**
 * Create Order from Successful Payment
 * This is the core logic extracted from the event listener
 * Can be called directly or via events
 */
export const createOrderFromPayment = async (orderIntentId, paymentId, paymentType, session = null) => {
  const shouldManageSession = !session;
  const localSession = session || await mongoose.startSession();

  try {
    if (shouldManageSession) {
      localSession.startTransaction();
    }
    
    console.log("🔄 Creating order for OrderIntent:", orderIntentId);

    // 1️⃣ Fetch OrderIntent
    const orderIntent = await OrderIntent.findById(orderIntentId).session(localSession);

    if (!orderIntent) {
      throw new Error(`OrderIntent not found: ${orderIntentId}`);
    }

    console.log("📋 OrderIntent found:", {
      _id: orderIntent._id.toString(),
      status: orderIntent.status,
      totalAmount: orderIntent.totalAmount
    });

    // 2️⃣ Idempotency check — already converted?
    if (orderIntent.status === "CONVERTED") {
      console.log("⚠️ OrderIntent already converted, skipping");
      if (shouldManageSession) {
        await localSession.abortTransaction();
      }
      
      // Return existing order
      const existingOrder = await Order.findOne({ orderIntentId }).session(localSession);
      return existingOrder;
    }

    // 3️⃣ Check if Order already exists
    const existingOrder = await Order.findOne({ orderIntentId }).session(localSession);
    if (existingOrder) {
      console.log("⚠️ Order already exists:", existingOrder._id);
      if (shouldManageSession) {
        await localSession.abortTransaction();
      }
      return existingOrder;
    }

    console.log("✅ No existing order found, proceeding with creation...");

    // 4️⃣ Verify payment
    const payment = await Payment.findById(paymentId).session(localSession);
    if (!payment || payment.paymentStatus !== "SUCCESS") {
      throw new Error(`Payment not verified: ${paymentId}, status: ${payment?.paymentStatus}`);
    }

    console.log("✅ Payment verified:", {
      paymentId,
      status: payment.paymentStatus,
      paidAmount: payment.paidAmount
    });

    // 5️⃣ Validate PARTIAL_COD advance
    if (paymentType === "PARTIAL_COD" && payment.paidAmount < 199) {
      throw new Error(`Partial COD advance not met: ${payment.paidAmount}`);
    }

    console.log("🔄 Consuming inventory...");

    // 6️⃣ Consume inventory
    await consumeStock(orderIntent._id, localSession);

    console.log("✅ Inventory consumed");
    console.log("🔄 Creating order document...");

    // 7️⃣ Create Order
    const orderNumber = generateOrderNumber();
    console.log("📝 Generated order number:", orderNumber);
    
    if (!orderNumber) {
      throw new Error("Failed to generate order number");
    }

    const order = await Order.create([{
      orderNumber,
      orderIntentId: orderIntent._id,
      userId: orderIntent.userId,
      paymentId: payment._id.toString(),
      finalAmount: orderIntent.totalAmount,
      gstAmount: orderIntent.gstAmount,
      status: "CONFIRMED",
      confirmedAt: new Date()
    }], { session: localSession });

    console.log("✅ Order created:", {
      orderId: order[0]._id.toString(),
      orderNumber: order[0].orderNumber,
      status: order[0].status
    });

    // 8️⃣ Update OrderIntent → CONVERTED
    const oldStatus = orderIntent.status;
    orderIntent.status = transitionOrderIntent(orderIntent.status, "CONVERTED");
    orderIntent.convertedOrderId = order[0]._id;
    await orderIntent.save({ session: localSession });

    console.log("✅ OrderIntent status updated:", {
      from: oldStatus,
      to: orderIntent.status
    });

    // 9️⃣ Commit transaction
    if (shouldManageSession) {
      await localSession.commitTransaction();
    }

    console.log("✅✅✅ ORDER CREATION SUCCESSFUL ✅✅✅");
    console.log("Order ID:", order[0]._id.toString());
    console.log("Order Number:", order[0].orderNumber);

    return order[0];

  } catch (error) {
    if (shouldManageSession) {
      await localSession.abortTransaction();
    }
    console.error("❌ Order creation failed:", error);
    throw error;
  } finally {
    if (shouldManageSession) {
      localSession.endSession();
    }
  }
};
