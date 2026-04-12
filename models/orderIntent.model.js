import mongoose from "mongoose";

const orderIntentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    status: {
      type: String,
      enum: [
        "CREATED",
        "RESERVED",
        "PAYMENT_IN_PROGRESS",
        "CANCELLED",
        "EXPIRED",
        "CONVERTED"
      ],
      required: true
    },

    subtotal: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true },
    totalAmount: { type: Number, required: true },

    deliveryAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      addressLine1: { type: String, required: true },
      addressLine2: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true }
    },

    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export default mongoose.model("OrderIntent", orderIntentSchema);
