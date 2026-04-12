import mongoose from "mongoose";
import generateOrderNumber from "../utils/generateOrderNumber.js";

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },

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

  orderType: {
    type: String,
    enum: ["ONLINE", "PARTIAL_COD"],
    required: true
  },

  finalAmount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  
  paidAmount: { 
    type: Number, 
    required: true,
    default: 0
  },
  
  amountDue: { 
    type: Number, 
    required: true,
    default: 0,
    comment: "Amount to be collected during delivery (for PARTIAL_COD)"
  },

  status: {
    type: String,
    enum: ["CONFIRMED", "SHIPPED", "DELIVERED", "REFUNDED"],
    required: true
  },

  confirmedAt: { type: Date, required: true }
});

// Auto-generate orderNumber before saving
orderSchema.pre('save', async function() {
  if (!this.orderNumber) {
    this.orderNumber = generateOrderNumber();
  }
  // Note: No next() call needed in async middleware
});

export default mongoose.model("Order", orderSchema);