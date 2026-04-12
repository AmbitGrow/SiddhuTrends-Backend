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

// Invariant: reservedStock must never exceed totalStock
inventorySchema.pre('save', async function () {
  if (this.reservedStock > this.totalStock) {
    throw new Error(
      `Invariant violation: reservedStock (${this.reservedStock}) > totalStock (${this.totalStock})`
    );
  }
});

export default mongoose.model("Inventory", inventorySchema);
