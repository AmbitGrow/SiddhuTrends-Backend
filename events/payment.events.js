import mongoose from "mongoose";
import OrderIntent from "../models/orderIntent.model.js";
import Order from "../models/order.model.js";
import { consumeStock } from "../services/inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";
import { releaseStock } from "../services/inventory.service.js";


export async function handlePaymentVerified({
  orderIntentId,
  paymentId
}) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const existingOrder = await Order.findOne(
      { orderIntentId },
      null,
      { session }
    );

    if (existingOrder) {
      await session.commitTransaction();
      return; // idempotent exit
    }

    const orderIntent = await OrderIntent.findById(
      orderIntentId,
      null,
      { session }
    );

    if (!orderIntent) {
      throw new Error("OrderIntent not found");
    }

    if (orderIntent.status !== "PAYMENT_IN_PROGRESS") {
      await session.commitTransaction();
      return; // late or invalid event
    }

    await consumeStock(orderIntentId);

    const order = await Order.create(
      [{
        orderIntentId,
        paymentId,
        finalAmount: orderIntent.totalAmount,
        gstAmount: orderIntent.gstAmount,
        status: "CONFIRMED",
        confirmedAt: new Date()
      }],
      { session }
    );

    orderIntent.status = transitionOrderIntent(
      orderIntent.status,
      "CONVERTED"
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

export async function handlePaymentFailed({ orderIntentId }) {
  const orderIntent = await OrderIntent.findById(orderIntentId);

  if (!orderIntent) return;

  if (
    orderIntent.status === "CANCELLED" ||
    orderIntent.status === "EXPIRED"
  ) {
    return; // idempotent
  }

  await releaseStock(orderIntentId);

  orderIntent.status = transitionOrderIntent(
    orderIntent.status,
    "CANCELLED"
  );

  await orderIntent.save();
}
