import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  orderIntentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrderIntent",
    unique: true,
    required: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  paymentId: {
    type: String,
    required: true
  },

  finalAmount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },

  status: {
    type: String,
    enum: ["CONFIRMED", "SHIPPED", "DELIVERED", "REFUNDED"],
    required: true
  },

  confirmedAt: { type: Date, required: true }
});

export default mongoose.model("Order", orderSchema);
