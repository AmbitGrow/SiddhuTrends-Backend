import mongoose from "mongoose";
import Inventory from "../models/inventory.model.js";
import InventoryReservation from "../models/inventoryReservation.model.js";
import InventoryLog from "../models/inventoryLog.model.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

export async function reserveStock({
  orderIntent,
  items
}) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    for (const item of items) {
      const inventory = await Inventory.findOne(
        { productId: item.productId },
        null,
        { session }
      );

      if (!inventory) {
        throw new Error("Inventory not found");
      }

      const available =
        inventory.totalStock - inventory.reservedStock;

      if (available < item.quantity) {
        throw new Error("Insufficient stock");
      }

      inventory.reservedStock += item.quantity;
      await inventory.save({ session });

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

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function releaseStock(orderIntentId) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const reservations = await InventoryReservation.find(
      {
        orderIntentId,
        status: "ACTIVE"
      },
      null,
      { session }
    );

    for (const res of reservations) {
      const inventory = await Inventory.findOne(
        { productId: res.productId },
        null,
        { session }
      );

      inventory.reservedStock -= res.quantity;
      await inventory.save({ session });

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

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function consumeStock(orderIntentId) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const reservations = await InventoryReservation.find(
      {
        orderIntentId,
        status: "ACTIVE"
      },
      null,
      { session }
    );

    for (const res of reservations) {
      const inventory = await Inventory.findOne(
        { productId: res.productId },
        null,
        { session }
      );

      inventory.reservedStock -= res.quantity;
      inventory.totalStock -= res.quantity;

      if (inventory.totalStock < 0) {
        throw new Error("Stock invariant violated");
      }

      await inventory.save({ session });

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

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
