import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    slug: { type: String, required: true, unique: true },

    description: { type: String, default: "" },

    images: {
      type: [String],
      default: [],
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    mrp: {
      type: Number,
      required: true,
      min: 0,
    },

    investmentCost: {
      type: Number,
      required: true,
      min: 0,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    ageGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AgeGroup",
      required: true,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
    },
    reservedStock: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },

    numReviews: {
      type: Number,
      default: 0,
    },

    specifications: [
      {
        title: String,
        value: String,
      },
    ],

    isBestSeller: {
      type: Boolean,
      default: false,
    },

    isOffer: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

  },
  { timestamps: true },
);

export default mongoose.model("Product", productSchema);
