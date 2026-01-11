import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      unique: true,
      required: true
    },

    totalStock: { type: Number, required: true, min: 0 },
    reservedStock: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("Inventory", inventorySchema);
