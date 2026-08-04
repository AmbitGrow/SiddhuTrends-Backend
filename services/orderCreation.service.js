import mongoose from "mongoose";
import OrderIntent from "../models/orderIntent.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import OrderItem from "../models/orderItem.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import { consumeStock } from "./inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";
import generateOrderNumber from "../utils/generateOrderNumber.js";
import { confirmOrder } from "../modules/orders/order.service.js";
import { emitOrderLifecycleEvent } from "./orderLifecycle.service.js";

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

    // 2.5️⃣ Reject if expired or cancelled — prevents expiry vs payment race
    if (orderIntent.status === "EXPIRED" || orderIntent.status === "CANCELLED") {
      console.log(`❌ OrderIntent is ${orderIntent.status}, cannot create order`);
      if (shouldManageSession) {
        await localSession.abortTransaction();
      }
      throw new Error(`OrderIntent is ${orderIntent.status}. Cannot process payment — stock already released.`);
    }

    // 2.6️⃣ Verify OrderIntent is in valid state for conversion
    if (orderIntent.status !== "PAYMENT_IN_PROGRESS") {
      console.log(`❌ OrderIntent status is ${orderIntent.status}, expected PAYMENT_IN_PROGRESS`);
      if (shouldManageSession) {
        await localSession.abortTransaction();
      }
      throw new Error(`OrderIntent in unexpected state: ${orderIntent.status}`);
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

    // 7️⃣ Fetch OrderItems and build financial snapshot
    const orderItems = await OrderItem.find({ 
      orderIntentId: orderIntent._id 
    }).session(localSession);

    if (!orderItems || orderItems.length === 0) {
      throw new Error(`No order items found for OrderIntent ${orderIntentId}`);
    }

    console.log(`📦 Found ${orderItems.length} order items, building financial snapshot...`);

    // Build items array with full financial data
    const itemsWithFinancials = [];
    let totalInvestment = 0;

    for (const orderItem of orderItems) {
      const product = await Product.findById(orderItem.productId).session(localSession);
      
      if (!product) {
        throw new Error(`Product ${orderItem.productId} not found`);
      }

      const sellingPrice = orderItem.priceAtPurchase;
      const investmentCost = product.investmentCost;
      const quantity = orderItem.quantity;
      const totalSelling = sellingPrice * quantity;
      const itemTotalInvestment = investmentCost * quantity;

      totalInvestment += itemTotalInvestment;

      itemsWithFinancials.push({
        productId: product._id,
        productName: product.name,
        quantity,
        sellingPrice,
        investmentCost,
        totalSelling,
        totalInvestment: itemTotalInvestment
      });

      console.log(`  📊 ${product.name}: qty=${quantity}, sell=${sellingPrice}, cost=${investmentCost}, profit=${totalSelling - itemTotalInvestment}`);
    }

    // Calculate total profit
    const totalProfit = orderIntent.totalAmount - totalInvestment;

    console.log("💰 Financial Summary:", {
      finalAmount: orderIntent.totalAmount,
      totalInvestment,
      totalProfit,
      profitMargin: ((totalProfit / orderIntent.totalAmount) * 100).toFixed(2) + "%"
    });

    // 8️⃣ Create Order
    const orderNumber = generateOrderNumber();
    console.log("📝 Generated order number:", orderNumber);
    
    if (!orderNumber) {
      throw new Error("Failed to generate order number");
    }

    // Calculate amounts for COD
    const paidAmount = payment.paidAmount || 0;
    const amountDue = paymentType === "PARTIAL_COD" ? (orderIntent.totalAmount - paidAmount) : 0;
    const xpEarned = Math.round(orderIntent.totalAmount / 20);

    const order = await Order.create([{
      orderNumber,
      orderIntentId: orderIntent._id,
      userId: orderIntent.userId,
      paymentId: payment._id.toString(),
      paymentStatus: "PENDING",
      orderType: paymentType,
      items: itemsWithFinancials,
      finalAmount: orderIntent.totalAmount,
      gstAmount: orderIntent.gstAmount,
      subtotal: orderIntent.subtotal,
      deliveryCharge: orderIntent.deliveryCharge,
      totalInvestment,
      totalProfit,
      paidAmount: paidAmount,
      amountDue: amountDue,
      deliveryAddress: orderIntent.deliveryAddress,
      inventoryConsumed: true, // Stock was consumed in step 6
      status: "PENDING_PAYMENT",
      xpEarned
    }], { session: localSession });

    // Clear user's cart atomically within session
    await User.findByIdAndUpdate(orderIntent.userId, { $set: { cartItems: [] } }).session(localSession);
    console.log(`✅ Cart cleared atomically for user ${orderIntent.userId}`);

    const confirmedOrder = await confirmOrder({
      orderId: order[0]._id,
      session: localSession,
      metadata: { location: "System" },
      reason: "Order created from verified payment",
      skipEmit: true
    });

    console.log("✅ Order created:", {
      orderId: confirmedOrder._id.toString(),
      orderNumber: confirmedOrder.orderNumber,
      status: confirmedOrder.status,
      orderType: confirmedOrder.orderType,
      finalAmount: confirmedOrder.finalAmount,
      totalInvestment: confirmedOrder.totalInvestment,
      totalProfit: confirmedOrder.totalProfit,
      itemCount: confirmedOrder.items.length,
      paidAmount: confirmedOrder.paidAmount,
      amountDue: confirmedOrder.amountDue
    });

    // 9️⃣ Update OrderIntent → CONVERTED
    const oldStatus = orderIntent.status;
    orderIntent.status = transitionOrderIntent(orderIntent.status, "CONVERTED");
    orderIntent.convertedOrderId = confirmedOrder._id;
    await orderIntent.save({ session: localSession });

    console.log("✅ OrderIntent status updated:", {
      from: oldStatus,
      to: orderIntent.status
    });

    // 🔟 Commit transaction
    if (shouldManageSession) {
      await localSession.commitTransaction();
      emitOrderLifecycleEvent("ORDER_CONFIRMED", {
        orderId: confirmedOrder._id.toString(),
        orderNumber: confirmedOrder.orderNumber,
        userId: confirmedOrder.userId?.toString(),
        orderIntentId: orderIntent._id.toString(),
        finalAmount: confirmedOrder.finalAmount
      });
    }

    console.log("✅✅✅ ORDER CREATION SUCCESSFUL ✅✅✅");
    console.log("Order ID:", confirmedOrder._id.toString());
    console.log("Order Number:", confirmedOrder.orderNumber);
    console.log("💰 Profit:", totalProfit, `(${((totalProfit / orderIntent.totalAmount) * 100).toFixed(1)}% margin)`);

    return confirmedOrder;

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
