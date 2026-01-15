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
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true
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
