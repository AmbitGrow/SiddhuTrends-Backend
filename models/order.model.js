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

  paymentStatus: {
    type: String,
    enum: ["PENDING", "SUCCESS", "REFUND_INITIATED", "REFUNDED"],
    default: "SUCCESS"
  },

  orderType: {
    type: String,
    enum: ["ONLINE", "PARTIAL_COD"],
    required: true
  },

  // 💰 Financial Analytics Fields
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
      },
      productName: {
        type: String,
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      sellingPrice: {
        type: Number,
        required: true,
        comment: "Price at time of purchase (snapshot)"
      },
      investmentCost: {
        type: Number,
        required: true,
        comment: "Cost at time of purchase (snapshot)"
      },
      totalSelling: {
        type: Number,
        required: true,
        comment: "sellingPrice × quantity"
      },
      totalInvestment: {
        type: Number,
        required: true,
        comment: "investmentCost × quantity"
      }
    }
  ],

  finalAmount: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  subtotal: { type: Number, required: true },
  deliveryCharge: { type: Number, required: true },
  
  totalInvestment: {
    type: Number,
    required: true,
    comment: "Sum of all item totalInvestment (for profit analytics)"
  },

  totalProfit: {
    type: Number,
    required: true,
    comment: "finalAmount - totalInvestment (gross profit before expenses)"
  },
  
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

  deliveryAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: "" },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true }
  },

  trackingId: {
    type: String,
    default: null
  },

  trackingHistory: [
    {
      status: { type: String, required: true },
      location: { type: String, default: "System" },
      timestamp: { type: Date, default: Date.now }
    }
  ],

  xpEarned: {
    type: Number,
    default: 0
  },

  cancelRequest: {
    status: {
      type: String,
      enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
      default: "NONE"
    },
    reason: { type: String, default: null },
    requestedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    adminNote: { type: String, default: null }
  },

  refundRequest: {
    status: {
      type: String,
      enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
      default: "NONE"
    },
    reason: { type: String, default: null },
    requestedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    adminNote: { type: String, default: null }
  },

  status: {
    type: String,
    enum: [
      "PENDING_PAYMENT",
      "CONFIRMED",
      "SHIPPED",
      "DELIVERED",
      "REFUND_INITIATED",
      "REFUNDED",
      "CANCELLED"
    ],
    required: true
  },

  inventoryConsumed: {
    type: Boolean,
    default: false,
    comment: "Set to true after consumeStock() succeeds. Prevents double-consume and validates restock eligibility."
  },

  confirmedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: null },
  codCollectedAt: { 
    type: Date, 
    default: null,
    comment: "When COD portion was collected by delivery person" 
  },
  refundReason: { type: String, default: null },
  refundInitiatedAt: { type: Date, default: null },
  refundedAt: { type: Date, default: null }
});

// Auto-generate orderNumber before saving
orderSchema.pre('save', async function() {
  if (!this.orderNumber) {
    this.orderNumber = generateOrderNumber();
  }
  // Note: No next() call needed in async middleware
});

// Auto-generate orderNumber before saving
orderSchema.pre('save', async function() {
  if (!this.orderNumber) {
    this.orderNumber = generateOrderNumber();
  }
  // Note: No next() call needed in async middleware
});

export default mongoose.model("Order", orderSchema);