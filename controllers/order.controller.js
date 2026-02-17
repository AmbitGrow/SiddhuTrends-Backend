import mongoose from "mongoose";
import OrderIntent from "../models/orderIntent.model.js";
import OrderItem from "../models/orderItem.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";

import { reserveStock } from "../services/inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

/**
 * CREATE ORDER INTENT (Buy Now / Cart Checkout)
 * This does NOT create a final order.
 * Full atomic transaction: Intent + Items + Reservations
 */
export const createOrderIntent = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const userId = req.user._id;
    const { items } = req.body;
    // items = [{ productId, quantity }]

    if (!items || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "No items provided" });
    }

    // 1️⃣ Fetch products
    const products = await Product.find({
      _id: { $in: items.map(i => i.productId) },
      isActive: true
    }).session(session);

    if (products.length !== items.length) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid or inactive product" });
    }

    // 2️⃣ Create product lookup
    const productMap = new Map();
    products.forEach(p => productMap.set(p._id.toString(), p));

    // 3️⃣ Price calculation
    let subtotal = 0;
    let gstAmount = 0;

    const GST_RATE = 0.18; // 18%

    for (const item of items) {
      const product = productMap.get(item.productId.toString());

      if (item.quantity <= 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: "Invalid quantity" });
      }

      const basePrice = product.price * item.quantity;
      const gst = basePrice * GST_RATE;

      subtotal += basePrice;
      gstAmount += gst;
    }

    // 4️⃣ Delivery charge logic
    const deliveryCharge = subtotal >= 1000 ? 0 : 50;
    const totalAmount = subtotal + gstAmount + deliveryCharge;

    // 5️⃣ Create OrderIntent (within transaction)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const orderIntentDoc = await OrderIntent.create([{
      userId,
      status: "CREATED",
      subtotal,
      gstAmount,
      deliveryCharge,
      totalAmount,
      expiresAt
    }], { session });
    
    const orderIntent = orderIntentDoc[0];

    // 6️⃣ Create OrderItem snapshots (within transaction)
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

    // 7️⃣ Reserve stock (transactional) - passes session internally
    await reserveStock({
      orderIntent,
      items,
      session  // Pass session to reserveStock
    });

    // 8️⃣ Commit transaction
    await session.commitTransaction();

    return res.status(201).json({
      message: "Order intent created",
      orderIntentId: orderIntent._id,
      totalAmount,
      expiresAt
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Create OrderIntent Error:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
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
  