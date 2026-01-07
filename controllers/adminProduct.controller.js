import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import AgeGroup from "../models/ageGroup.model.js";

// =============== CREATE PRODUCT (ADMIN) ===============
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      images,
      price,
      investmentCost,
      categoryId,
      ageGroupId,
      stock,
      isBestSeller,
      isOffer,
    } = req.body;

    // Required field validation
    if (!name || price == null || stock == null || !categoryId || !ageGroupId) {
      return res.status(400).json({
        message: "Required fields missing",
      });
    }

    // Numeric validations
    if (
      price < 0 ||
      stock < 0 ||
      (investmentCost != null && investmentCost < 0)
    ) {
      return res.status(400).json({
        message: "Price, investmentCost and stock must be >= 0",
      });
    }

    // Validate category
    const category = await Category.findOne({
      _id: categoryId,
      isActive: true,
    });

    if (!category) {
      return res.status(400).json({
        message: "Invalid or inactive category",
      });
    }

    // Validate age group
    const ageGroup = await AgeGroup.findOne({
      _id: ageGroupId,
      isActive: true,
    });

    if (!ageGroup) {
      return res.status(400).json({
        message: "Invalid or inactive age group",
      });
    }

    const product = await Product.create({
      name,
      description,
      images: images || [],
      price,
      investmentCost,
      categoryId,
      ageGroupId,
      stock,
      isBestSeller: isBestSeller || false,
      isOffer: isOffer || false,
    });

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    console.error("Create Product Error:", err);
    res.status(500).json({ message: "Failed to create product" });
  }
};

// =============== UPDATE PRODUCT (ADMIN) ===============
export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const updates = req.body;
    if (updates.categoryId) {
  const category = await Category.findOne({
    _id: updates.categoryId,
    isActive: true
  });

  if (!category) {
    return res.status(400).json({
      message: "Invalid or inactive category"
    });
  }
}

if (updates.ageGroupId) {
  const ageGroup = await AgeGroup.findOne({
    _id: updates.ageGroupId,
    isActive: true
  });

  if (!ageGroup) {
    return res.status(400).json({
      message: "Invalid or inactive age group"
    });
  }
}


    if (
      (updates.price != null && updates.price < 0) ||
      (updates.investmentCost != null && updates.investmentCost < 0)
    ) {
      return res
        .status(400)
        .json({ message: "Price & investmentCost must be >= 0" });
    }

    Object.assign(product, updates);

    await product.save();

    res.json({
      message: "Product updated successfully",
      product,
    });
  } catch (err) {
    console.error("Update Product Error:", err);
    res.status(500).json({ message: "Failed to update product" });
  }
};

// =============== GET ALL PRODUCTS (ADMIN) ===============
export const getAllProductsAdmin = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    res.json({
      count: products.length,
      products,
    });
  } catch (err) {
    console.error("Get Products Error:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

// =============== GET PRODUCT BY ID (ADMIN) ===============
export const getProductByIdAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    return res.json({
      message: "Product fetched successfully",
      product
    });

  } catch (err) {
    console.error("Admin Product Detail Error:", err);
    return res.status(500).json({
      message: "Failed to fetch product"
    });
  }
};


// =============== UPDATE STOCK (ADMIN) ===============
export const updateProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock, change } = req.body;

    // Fetch product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let newStock = product.stock;

    // --- Absolute Stock Set (preferred for admin UI) ---
    if (stock !== undefined) {
      if (Number(stock) < 0) {
        return res
          .status(400)
          .json({ message: "Stock cannot be negative" });
      }

      newStock = Number(stock);
    }

    // --- Increment / Decrement (warehouse / order operations) ---
    if (change !== undefined) {
      newStock = product.stock + Number(change);

      if (newStock < 0) {
        return res
          .status(400)
          .json({ message: "Stock cannot go below zero" });
      }
    }

    // Safety check — must have at least one field
    if (stock === undefined && change === undefined) {
      return res
        .status(400)
        .json({ message: "Provide either stock or change value" });
    }

    product.stock = newStock;
    await product.save();

    return res.json({
      message: "Stock updated successfully",
      stock: product.stock,
    });
  } catch (err) {
    console.error("Stock Update Error:", err);
    return res.status(500).json({ message: "Failed to update stock" });
  }
};