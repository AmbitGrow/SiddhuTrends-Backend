import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import AgeGroup from "../models/ageGroup.model.js";


// =============== USER — PUBLIC PRODUCT LIST ===============
export const listProducts = async (req, res) => {
  try {
    const filters = { isActive: true };

    if (req.query.categoryId) filters.categoryId = req.query.categoryId;
    if (req.query.ageGroupId) filters.ageGroupId = req.query.ageGroupId;
    if (req.query.bestSeller) filters.isBestSeller = true;
    if (req.query.offer) filters.isOffer = true;

    const products = await Product.find(filters).sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    console.error("List Products Error:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

// =============== USER — PRODUCT DETAIL ===============
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product || !product.isActive) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("Product Detail Error:", err);
    res.status(500).json({ message: "Failed to fetch product" });
  }
};
