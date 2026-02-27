import mongoose from "mongoose";

const MAX_RETRIES = 3;

/**
 * 🔁 Production-Grade MongoDB Transaction Runner with Auto-Retry
 * 
 * Handles:
 * - TransientTransactionError (temporary locks)
 * - WriteConflict (race conditions)
 * 
 * Usage:
 * await runTransactionWithRetry(async (session) => {
 *   await SomeModel.create([...], { session });
 *   await AnotherModel.updateOne(..., {}, { session });
 * });
 */
export const runTransactionWithRetry = async (transactionFn) => {
  const session = await mongoose.startSession();

  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      await session.withTransaction(async () => {
        await transactionFn(session);
      });

      session.endSession();
      return; // success

    } catch (error) {

      const isTransient =
        error.hasErrorLabel?.("TransientTransactionError") ||
        error.codeName === "WriteConflict";

      if (!isTransient || attempt === MAX_RETRIES - 1) {
        session.endSession();
        throw error;
      }

      attempt++;
      console.log(`🔁 Retrying transaction (attempt ${attempt})...`);
    }
  }
};
