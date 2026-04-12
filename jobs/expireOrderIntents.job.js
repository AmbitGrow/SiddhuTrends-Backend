import OrderIntent from "../models/orderIntent.model.js";
import { releaseStock } from "../services/inventory.service.js";
import { transitionOrderIntent } from "../domain/orderIntent.state.js";

export async function expireOrderIntents() {
  console.log("⏰ Running expiry check at", new Date().toISOString());
  const now = new Date();

  const expiredIntents = await OrderIntent.find({
    expiresAt: { $lt: now },
    status: {
      $in: ["CREATED", "RESERVED", "PAYMENT_IN_PROGRESS"]
    }
  });

  if (expiredIntents.length === 0) {
    console.log("✅ No expired order intents found");
    return;
  }

  console.log(`🔍 Found ${expiredIntents.length} expired order intent(s) to process`);

  let successCount = 0;
  let failCount = 0;

  for (const intent of expiredIntents) {
    try {
      console.log(`🗑️ Expiring OrderIntent ${intent._id} (expired at ${intent.expiresAt.toISOString()})`);
      
      await releaseStock(intent._id);

      intent.status = transitionOrderIntent(
        intent.status,
        "EXPIRED"
      );

      await intent.save();
      
      successCount++;
      console.log(`✅ Successfully expired OrderIntent ${intent._id}`);
    } catch (err) {
      // log and continue — job must not stop
      failCount++;
      console.error(
        `❌ Failed to expire OrderIntent ${intent._id}:`,
        err.message
      );
    }
  }

  console.log(`📊 Expiry job complete: ${successCount} succeeded, ${failCount} failed`);
}
