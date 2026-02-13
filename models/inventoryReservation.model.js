import mongoose from "mongoose";

const inventoryReservationSchema = new mongoose.Schema(
  {
    orderIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderIntent",
      required: true
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    quantity: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: ["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"],
      required: true
    },

    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export default mongoose.model(
  "InventoryReservation",
  inventoryReservationSchema
);
