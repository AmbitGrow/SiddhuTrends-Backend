import mongoose from "mongoose";

const orderAuditSchema = new mongoose.Schema({
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

  action: {
    type: String,
    required: true
  },

  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  reason: {
    type: String,
    default: null
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

export default mongoose.model("OrderAudit", orderAuditSchema);
