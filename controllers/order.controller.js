import mongoose from "mongoose";
import OrderIntent from "../models/orderIntent.model.js";
import OrderItem from "../models/orderItem.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Inventory from "../models/inventory.model.js";
import User from "../models/user.model.js";

import { reserveStock } from "../services/inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";
import { runTransactionWithRetry } from "../utils/transactionRunner.js";

const createOrderIntentInternal = async ({ userId, items, deliveryAddress }) => {
  let orderIntent;
  let totalAmount;
  let expiresAt;

  await runTransactionWithRetry(async (session) => {
    if (!items || items.length === 0) {
      throw { status: 400, message: "No items provided" };
    }

    if (
      !deliveryAddress ||
      !deliveryAddress.fullName ||
      !deliveryAddress.phone ||
      !deliveryAddress.addressLine1 ||
      !deliveryAddress.city ||
      !deliveryAddress.state ||
      !deliveryAddress.pincode
    ) {
      throw { status: 400, message: "Complete delivery address is required" };
    }

    const existingActiveIntent = await OrderIntent.findOne({
      userId,
      status: { $in: ["CREATED", "RESERVED", "PAYMENT_IN_PROGRESS"] },
      expiresAt: { $gt: new Date() }
    }).session(session);

    if (existingActiveIntent) {
      throw {
        status: 409,
        message: "You already have an active order in progress. Please complete or wait for it to expire.",
        existingOrderIntentId: existingActiveIntent._id,
        expiresAt: existingActiveIntent.expiresAt
      };
    }

    const products = await Product.find({
      _id: { $in: items.map(i => i.productId) },
      isActive: true
    }).session(session);

    if (products.length !== items.length) {
      throw { status: 400, message: "Invalid or inactive product" };
    }

    const productMap = new Map();
    products.forEach(p => productMap.set(p._id.toString(), p));

    const productIds = items.map(i => i.productId);
    const inventories = await Inventory.find({
      productId: { $in: productIds }
    }).session(session);

    const inventoryMap = new Map();
    inventories.forEach(inv => inventoryMap.set(inv.productId.toString(), inv));

    for (const item of items) {
      const productId = item.productId.toString();
      const product = productMap.get(productId);
      const inventory = inventoryMap.get(productId);

      if (!inventory) {
        throw {
          status: 400,
          message: `Product "${product.name}" has no inventory record. Please contact support.`,
          productId,
          productName: product.name
        };
      }

      const availableStock = inventory.totalStock - inventory.reservedStock;
      if (availableStock < item.quantity) {
        throw {
          status: 400,
          message: `Insufficient stock for "${product.name}". Available: ${availableStock}, Requested: ${item.quantity}`,
          productId,
          productName: product.name,
          availableStock,
          requestedQuantity: item.quantity
        };
      }
    }

    let subtotal = 0;
    let gstAmount = 0;

    const GST_RATE = 0.18;

    for (const item of items) {
      const product = productMap.get(item.productId.toString());

      if (item.quantity <= 0) {
        throw { status: 400, message: "Invalid quantity" };
      }

      const basePrice = product.price * item.quantity;
      const gst = basePrice * GST_RATE;

      subtotal += basePrice;
      gstAmount += gst;
    }

    const deliveryCharge = subtotal >= 1000 ? 0 : 50;
    totalAmount = subtotal + gstAmount + deliveryCharge;

    expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const orderIntentDoc = await OrderIntent.create([{
      userId,
      status: "CREATED",
      subtotal,
      gstAmount,
      deliveryCharge,
      totalAmount,
      deliveryAddress,
      expiresAt
    }], { session });
    
    orderIntent = orderIntentDoc[0];

    const orderItems = items.map(item => {
      const product = productMap.get(item.productId.toString());

      return {
        orderIntentId: orderIntent._id,
        productId: product._id,
        quantity: item.quantity,
        priceAtPurchase: product.price,
        gstRateAtPurchase: GST_RATE
      };
    });

    await OrderItem.insertMany(orderItems, { session });

    await reserveStock({
      orderIntent,
      items,
      session
    });
  });

  try {
    await User.findByIdAndUpdate(userId, { cartItems: [] });
    console.log(`✅ Cart cleared for user ${userId} after order intent creation`);
  } catch (cartError) {
    console.error("⚠️ Failed to clear cart:", cartError);
  }

  return { orderIntent, totalAmount, expiresAt };
};

/**
 * CREATE ORDER INTENT (Buy Now / Cart Checkout)
 * This does NOT create a final order.
 * Full atomic transaction: Intent + Items + Reservations
 * 🔁 WITH AUTOMATIC RETRY for race conditions
 */
export const createOrderIntent = async (req, res) => {
  const userId = req.user._id;
  const { items, deliveryAddress } = req.body;

  try {
    const { orderIntent, totalAmount, expiresAt } = await createOrderIntentInternal({
      userId,
      items,
      deliveryAddress
    });

    return res.status(201).json({
      message: "Order intent created",
      orderIntentId: orderIntent._id,
      totalAmount,
      expiresAt
    });
  } catch (error) {
    console.error("Create OrderIntent Error:", error);
    
    if (error.status) {
      const { status, message, ...details } = error;
      return res.status(status).json({ message, ...details });
    }
    
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

/**
 * CREATE ORDER INTENT FROM CART
 */
export const createOrderIntentFromCart = async (req, res) => {
  const userId = req.user._id;
  const { deliveryAddress } = req.body;

  try {
    const user = await User.findById(userId);

    if (!user || !user.cartItems.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const items = user.cartItems.map(item => ({
      productId: item.product,
      quantity: item.quantity
    }));

    const { orderIntent, totalAmount, expiresAt } = await createOrderIntentInternal({
      userId,
      items,
      deliveryAddress
    });

    return res.status(201).json({
      message: "Order intent created from cart",
      orderIntentId: orderIntent._id,
      totalAmount,
      expiresAt
    });
  } catch (error) {
    console.error("Create OrderIntent From Cart Error:", error);

    if (error.status) {
      const { status, message, ...details } = error;
      return res.status(status).json({ message, ...details });
    }

    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

/**
 * GET USER ORDER INTENTS (PENDING/IN-PROGRESS)
 */
export const getMyOrderIntents = async (req, res) => {
  try {
    const userId = req.user._id;

    const orderIntents = await OrderIntent.find({ 
      userId,
      status: { $in: ["CREATED", "RESERVED", "PAYMENT_IN_PROGRESS"] }
    })
      .sort({ createdAt: -1 });

    return res.json(orderIntents);
  } catch (error) {
    console.error("Get OrderIntents Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET USER ORDERS (FINAL CONFIRMED ORDERS ONLY)
 */
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await Order.find({ userId })
      .sort({ confirmedAt: -1 });

    return res.json(orders);
  } catch (error) {
    console.error("Get Orders Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET ORDER BY ID (Customer)
 */
export const getOrderById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("Get Order By Id Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET TRACKING BY ORDER ID (Customer)
 */
export const getOrderTracking = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      trackingId: order.trackingId,
      trackingHistory: order.trackingHistory || []
    });
  } catch (error) {
    console.error("Get Order Tracking Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * CUSTOMER CANCEL REQUEST
 */
export const requestOrderCancel = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "CONFIRMED") {
      return res.status(400).json({
        message: `Cancellation request is allowed only for CONFIRMED orders. Current status: ${order.status}`
      });
    }

    if (order.cancelRequest?.status === "PENDING") {
      return res.status(400).json({ message: "Cancellation request is already pending" });
    }

    order.cancelRequest = {
      status: "PENDING",
      reason,
      requestedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      adminNote: null
    };

    await order.save();

    return res.json({
      message: "Cancellation request submitted successfully",
      orderNumber: order.orderNumber,
      requestStatus: order.cancelRequest.status
    });
  } catch (error) {
    console.error("Request Cancel Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * CUSTOMER REFUND REQUEST
 */
export const requestOrderRefund = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "DELIVERED") {
      return res.status(400).json({
        message: `Refund request is allowed only for DELIVERED orders. Current status: ${order.status}`
      });
    }

    if (order.refundRequest?.status === "PENDING") {
      return res.status(400).json({ message: "Refund request is already pending" });
    }

    if (["REFUND_INITIATED", "REFUNDED"].includes(order.status)) {
      return res.status(400).json({ message: "Refund already initiated or completed" });
    }

    order.refundRequest = {
      status: "PENDING",
      reason,
      requestedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      adminNote: null
    };

    await order.save();

    return res.json({
      message: "Refund request submitted successfully",
      orderNumber: order.orderNumber,
      requestStatus: order.refundRequest.status
    });
  } catch (error) {
    console.error("Request Refund Error:", error);
    return res.status(500).json({ message: error.message });
  }
};
  