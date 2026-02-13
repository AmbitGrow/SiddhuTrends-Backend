import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
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

  priceAtPurchase: { type: Number, required: true },
  gstRateAtPurchase: { type: Number, required: true }
});

export default mongoose.model("OrderItem", orderItemSchema);
