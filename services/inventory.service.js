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

    // Idempotency: if no ACTIVE reservations, stock was already consumed
    if (reservations.length === 0) {
      const consumed = await InventoryReservation.countDocuments({
        orderIntentId,
        status: "CONSUMED"
      }).session(session);

      if (consumed > 0) {
        console.log(`⚠️ consumeStock: already consumed for ${orderIntentId}, skipping (idempotent)`);
        if (shouldManageSession) {
          await session.commitTransaction();
        }
        return;
      }
      throw new Error(`No active reservations found for OrderIntent ${orderIntentId}`);
    }

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

/**
 * RESTOCK ON CANCEL
 * Called when admin cancels a CONFIRMED order (before shipping)
 * Adds stock back to totalStock (since consumeStock already deducted it)
 */
export async function restockOnCancel(order, externalSession = null) {
  const session = externalSession || await mongoose.startSession();
  const shouldManageSession = !externalSession;

  try {
    if (shouldManageSession) {
      session.startTransaction();
    }

    for (const item of order.items) {
      // Atomic: increment totalStock back
      const result = await Inventory.findOneAndUpdate(
        { productId: item.productId },
        { $inc: { totalStock: item.quantity } },
        { session, new: true }
      );

      if (!result) {
        throw new Error(`Inventory record not found for product ${item.productId}`);
      }

      // Sync Product.stock
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity } },
        { session }
      );

      await InventoryLog.create(
        [{
          productId: item.productId,
          orderIntentId: order.orderIntentId,
          action: "RESTOCK_CANCEL",
          quantity: item.quantity
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
