import mongoose from "mongoose";
import Order from "../models/order.model.js";
import { transitionOrder } from "../domain/order.state.js";
import { restockOnCancel } from "../services/inventory.service.js";

/**
 * CANCEL ORDER (Admin only — before shipping)
 * Restocks inventory atomically
 */
export const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }

    // State machine validates only CONFIRMED can be cancelled
    const newStatus = transitionOrder(order.status, "CANCELLED");

    // Restock inventory ONLY if it was consumed
    if (order.inventoryConsumed) {
      await restockOnCancel(order, session);
      order.inventoryConsumed = false;
      console.log(`📦 Stock restored for order ${order.orderNumber}`);
    } else {
      console.log(`⚠️ Inventory was never consumed for order ${order.orderNumber}, skipping restock`);
    }

    // Update order
    order.status = newStatus;
    order.cancelledAt = new Date();
    order.cancelReason = reason || "Cancelled by admin";
    await order.save({ session });

    await session.commitTransaction();

    console.log(`✅ Order ${order.orderNumber} cancelled, stock restored`);

    return res.json({
      message: "Order cancelled and stock restored",
      orderNumber: order.orderNumber,
      status: order.status,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Cancel Order Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ 
        message: "Order can only be cancelled before shipping" 
      });
    }

    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * GET ALL ORDERS (Admin)
 */
export const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .sort({ confirmedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("userId", "name email phone");

    const total = await Order.countDocuments(filter);

    return res.json({
      orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get All Orders Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET ORDER BY ID (Admin)
 */
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("userId", "name email phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(order);
  } catch (error) {
    console.error("Get Order Error:", error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * UPDATE ORDER STATUS (Admin — ship/deliver)
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const newStatus = transitionOrder(order.status, status);
    order.status = newStatus;
    await order.save();

    return res.json({
      message: `Order status updated to ${newStatus}`,
      orderNumber: order.orderNumber,
      status: order.status
    });
  } catch (error) {
    console.error("Update Order Status Error:", error);

    if (error.message.includes("Invalid Order transition")) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: error.message });
  }
};
