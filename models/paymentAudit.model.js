import mongoose from "mongoose";

const paymentAuditSchema = new mongoose.Schema({
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    required: true
  },

  orderIntentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrderIntent",
    required: true
  },

  fromStatus: String,
  toStatus: String,

  amount: Number,

  source: {
    type: String,
    enum: ["INITIATE_API", "VERIFY_API", "WEBHOOK", "SYSTEM"]
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("PaymentAudit", paymentAuditSchema);
