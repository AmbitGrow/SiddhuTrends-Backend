import mongoose from "mongoose";
import Inventory from "../models/inventory.model.js";
import InventoryReservation from "../models/inventoryReservation.model.js";
import InventoryLog from "../models/inventoryLog.model.js";
import Product from "../models/product.model.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

export async function reserveStock({
  orderIntent,
  items,
  session: externalSession
}) {
  // Use external session if provided (for atomic operations), otherwise create new
  const session = externalSession || await mongoose.startSession();
  const shouldManageSession = !externalSession;

  try {
    if (shouldManageSession) {
      session.startTransaction();
    }

    for (const item of items) {
      // Atomic update with race protection
      // This ensures check + update happen atomically at DB level
      const result = await Inventory.findOneAndUpdate(
        { 
          productId: item.productId,
          // Ensure available stock (totalStock - reservedStock) >= requested quantity
          $expr: { 
            $gte: [
              { $subtract: ["$totalStock", "$reservedStock"] }, 
              item.quantity
            ] 
          }
        },
        { 
          $inc: { reservedStock: item.quantity }
        },
        { 
          session, 
          new: true // Return updated document
        }
      );

      if (!result) {
        // This should rarely happen since we validate stock upfront
        // Only triggers in race conditions or if inventory was deleted mid-transaction
        throw new Error(`Stock reservation failed for product ${item.productId}. Stock may have been taken by another order.`);
      }

      await InventoryReservation.create(
        [{
          orderIntentId: orderIntent._id,
          productId: item.productId,
          quantity: item.quantity,
          status: "ACTIVE",
          expiresAt: orderIntent.expiresAt
        }],
        { session }
      );

      await InventoryLog.create(
        [{
          productId: item.productId,
          orderIntentId: orderIntent._id,
          action: "LOCK",
          quantity: item.quantity
        }],
        { session }
      );
    }

    orderIntent.status = transitionOrderIntent(
      orderIntent.status,
      "RESERVED"
    );
    await orderIntent.save({ session });

    if (shouldManageSession) {
      await session.commitTransaction();
    }
  } catch (err) {
    if (shouldManageSession) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (shouldManageSession) {
      session.endSession();
    }
  }
}

export async function releaseStock(orderIntentId, externalSession = null) {
  const session = externalSession || await mongoose.startSession();
  const shouldManageSession = !externalSession;

  try {
    if (shouldManageSession) {
      session.startTransaction();
    }

    const reservations = await InventoryReservation.find(
      {
        orderIntentId,
        status: "ACTIVE"
      },
      null,
      { session }
    );

    for (const res of reservations) {
      // Atomic decrement of reservedStock
      const result = await Inventory.findOneAndUpdate(
        { 
          productId: res.productId,
          reservedStock: { $gte: res.quantity } // Safety check
        },
        { 
          $inc: { reservedStock: -res.quantity }
        },
        { session, new: true }
      );

      if (!result) {
        throw new Error(`Cannot release stock for product ${res.productId}`);
      }

      res.status = "RELEASED";
      await res.save({ session });

      await InventoryLog.create(
        [{
          productId: res.productId,
          orderIntentId,
          action: "RELEASE",
          quantity: res.quantity
        }],
        { session }
      );
    }

    if (shouldManageSession) {
      await session.commitTransaction();
    }
  } catch (err) {
    if (shouldManageSession) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (shouldManageSession) {
      session.endSession();
    }
  }
}

export async function consumeStock(orderIntentId, externalSession = null) {
  const session = externalSession || await mongoose.startSession();
  const shouldManageSession = !externalSession;

  try {
    if (shouldManageSession) {
      session.startTransaction();
    }

    const reservations = await InventoryReservation.find(
      {
        orderIntentId,
        status: "ACTIVE"
      },
      null,
      { session }
    );

    for (const res of reservations) {
      // Atomic update: decrement both reserved and total stock in Inventory
      const result = await Inventory.findOneAndUpdate(
        { 
          productId: res.productId,
          reservedStock: { $gte: res.quantity },
          totalStock: { $gte: res.quantity }
        },
        { 
          $inc: { 
            reservedStock: -res.quantity,
            totalStock: -res.quantity
          }
        },
        { session, new: true }
      );

      if (!result) {
        throw new Error(`Cannot consume stock for product ${res.productId}`);
      }

      // Sync Product.stock with Inventory.totalStock (bidirectional sync)
      await Product.findByIdAndUpdate(
        res.productId,
        { $inc: { stock: -res.quantity } },
        { session }
      );

      res.status = "CONSUMED";
      await res.save({ session });

      await InventoryLog.create(
        [{
          productId: res.productId,
          orderIntentId,
          action: "DEDUCT",
          quantity: res.quantity
        }],
        { session }
      );
    }

    if (shouldManageSession) {
      await session.commitTransaction();
    }
  } catch (err) {
    if (shouldManageSession) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    if (shouldManageSession) {
      session.endSession();
    }
  }
}
