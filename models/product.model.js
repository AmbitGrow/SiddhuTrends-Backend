import mongoose from "mongoose";

// Helper function to generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-');      // Replace multiple hyphens with single hyphen
}

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    slug: { 
      type: String, 
      unique: true,
      sparse: true  // Allows multiple null values during migration
    },

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
  { timestamps: true }
);

// Auto-generate slug before saving if not provided
productSchema.pre('save', async function() {
  if (!this.slug && this.name) {
    let baseSlug = generateSlug(this.name);
    let slug = baseSlug;
    let counter = 1;

    // Check for uniqueness and append number if needed
    while (await mongoose.models.Product.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
});

export default mongoose.model("Product", productSchema);
