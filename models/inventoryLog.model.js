import mongoose from "mongoose";

const inventoryLogSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    orderIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderIntent",
      default: null
    },

    action: {
      type: String,
      enum: ["LOCK", "RELEASE", "DEDUCT", "EXPIRE"],
      required: true
    },

    quantity: { type: Number, required: true }
  },
  { timestamps: true }
);

export default mongoose.model("InventoryLog", inventoryLogSchema);
