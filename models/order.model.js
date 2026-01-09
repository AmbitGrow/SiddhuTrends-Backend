const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  name: String,                 // snapshot
  price: Number,               // snapshot
  quantity: Number,
  investmentCost: Number       // snapshot (for profit calc)
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  items: [orderItemSchema],

  pricing: {
    subtotal: Number,
    deliveryCharge: Number,
    totalAmount: Number,
    profit: Number
  },

  payment: {
    method: { type: String, enum: ["online"], default: "online" },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    transactionId: String
  },

  status: {
    type: String,
    enum: ["created", "confirmed", "shipped", "delivered", "cancelled"],
    default: "created"
  },

  addressSnapshot: {
    name: String,
    phone: String,
    address: String,
    city: String,
    pincode: String
  }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);


orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
