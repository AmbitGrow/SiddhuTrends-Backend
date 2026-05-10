import mongoose from "mongoose";

const orderLogSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: true,
    index: true
  },
  fromStatus: {
    type: String,
    default: null
  },
  toStatus: {
    type: String,
    required: true
  },
  changedBy: {
    type: String,
    enum: ["ADMIN", "SYSTEM", "USER"],
    required: true
  },
  reason: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

export default mongoose.model("OrderLog", orderLogSchema);
