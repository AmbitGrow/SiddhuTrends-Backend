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

/**
 * CREATE ORDER INTENT (Buy Now / Cart Checkout)
 * This does NOT create a final order.
 * Full atomic transaction: Intent + Items + Reservations
 * 🔁 WITH AUTOMATIC RETRY for race conditions
 */
export const createOrderIntent = async (req, res) => {
  const userId = req.user._id;
  const { items } = req.body;

  try {
    let orderIntent;
    let totalAmount;
    let expiresAt;

    // 🔁 Run transaction with automatic retry for race conditions
    await runTransactionWithRetry(async (session) => {
      // items = [{ productId, quantity }]

      if (!items || items.length === 0) {
        throw { status: 400, message: "No items provided" };
      }

      // 🛡️ Enhancement 5: Guard against duplicate active intents
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

      // 1️⃣ Fetch products
      const products = await Product.find({
        _id: { $in: items.map(i => i.productId) },
        isActive: true
      }).session(session);

      if (products.length !== items.length) {
        throw { status: 400, message: "Invalid or inactive product" };
      }

      // 2️⃣ Create product lookup
      const productMap = new Map();
      products.forEach(p => productMap.set(p._id.toString(), p));

      // 3️⃣ Validate inventory exists and check stock availability
      const productIds = items.map(i => i.productId);
      const inventories = await Inventory.find({
        productId: { $in: productIds }
      }).session(session);

      // Create inventory lookup map
      const inventoryMap = new Map();
      inventories.forEach(inv => inventoryMap.set(inv.productId.toString(), inv));

      // Check each item for inventory issues
      for (const item of items) {
        const productId = item.productId.toString();
        const product = productMap.get(productId);
        const inventory = inventoryMap.get(productId);

        // Check if inventory record exists
        if (!inventory) {
          throw {
            status: 400,
            message: `Product "${product.name}" has no inventory record. Please contact support.`,
            productId,
            productName: product.name
          };
        }

        // Check if sufficient stock available
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

      // 4️⃣ Price calculation
      let subtotal = 0;
      let gstAmount = 0;

      const GST_RATE = 0.18; // 18%

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

      // 5️⃣ Delivery charge logic
      const deliveryCharge = subtotal >= 1000 ? 0 : 50;
      totalAmount = subtotal + gstAmount + deliveryCharge;

      // 6️⃣ Create OrderIntent (within transaction)
      // 🕐 Enhancement 3: Short expiry window (10 minutes)
      expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      const orderIntentDoc = await OrderIntent.create([{
        userId,
        status: "CREATED",
        subtotal,
        gstAmount,
        deliveryCharge,
        totalAmount,
        expiresAt
      }], { session });
      
      orderIntent = orderIntentDoc[0];

      // 7️⃣ Create OrderItem snapshots (within transaction)
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

      // 8️⃣ Reserve stock (transactional) - passes session internally
      await reserveStock({
        orderIntent,
        items,
        session  // Pass session to reserveStock
      });

      // Transaction automatically commits if this callback completes successfully
    });

    // 🧹 Enhancement 2: Clear cart after successful order intent creation
    // This prevents re-checkout and duplicate reservations
    try {
      await User.findByIdAndUpdate(userId, { cartItems: [] });
      console.log(`✅ Cart cleared for user ${userId} after order intent creation`);
    } catch (cartError) {
      // Non-critical - log but don't fail the order
      console.error("⚠️ Failed to clear cart:", cartError);
    }

    return res.status(201).json({
      message: "Order intent created",
      orderIntentId: orderIntent._id,
      totalAmount,
      expiresAt
    });

  } catch (error) {
    console.error("Create OrderIntent Error:", error);
    
    // Handle business logic errors with custom status codes
    if (error.status) {
      const { status, message, ...details } = error;
      return res.status(status).json({ message, ...details });
    }
    
    // Handle unexpected errors
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

    const orders = await Order.find({ 
      userId,
      status: "CONFIRMED"
    })
      .sort({ confirmedAt: -1 });

    return res.json(orders);
  } catch (error) {
    console.error("Get Orders Error:", error);
    return res.status(500).json({ message: error.message });
  }
};
  