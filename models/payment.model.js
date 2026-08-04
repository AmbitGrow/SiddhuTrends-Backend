import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    orderIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderIntent",
      required: true,
      unique: true, // one payment per intent
      index: true
    },

    paymentType: {
      type: String,
      enum: ["ONLINE", "PARTIAL_COD"],
      required: true
    },

    gatewayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    gatewayPaymentId: {
      type: String,
      unique: true,
      sparse: true // only present after success
    },

    expectedAmount: {
      type: Number,
      required: true,
      min: 0
    },

    paidAmount: {
      type: Number,
      min: 0
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "ORPHANED", "REFUNDED"],
      default: "PENDING",
      index: true
    },

    refundStatus: {
      type: String,
      enum: ["NONE", "REQUESTED", "PROCESSED"],
      default: "NONE"
    },

    refundId: {
      type: String,
      sparse: true,
      comment: "Razorpay refund ID"
    },

    refundAmount: {
      type: Number,
      default: 0
    },

    refundReason: {
      type: String,
      default: null
    },

    refundInitiatedAt: {
      type: Date,
      default: null
    },

    refundProcessedAt: {
      type: Date,
      default: null
    },

    verifiedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Payment", paymentSchema);
