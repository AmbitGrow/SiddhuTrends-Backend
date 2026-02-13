import OrderIntent from "../models/orderIntent.model.js";
import { releaseStock } from "../services/inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

export async function expireOrderIntents() {
  const now = new Date();

  const expiredIntents = await OrderIntent.find({
    expiresAt: { $lt: now },
    status: {
      $in: ["CREATED", "RESERVED", "PAYMENT_IN_PROGRESS"]
    }
  });

  for (const intent of expiredIntents) {
    try {
      await releaseStock(intent._id);

      intent.status = transitionOrderIntent(
        intent.status,
        "EXPIRED"
      );

      await intent.save();
    } catch (err) {
      // log and continue — job must not stop
      console.error(
        `Failed to expire OrderIntent ${intent._id}`,
        err
      );
    }
  }
}
