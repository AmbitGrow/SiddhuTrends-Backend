import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import AgeGroup from "../models/ageGroup.model.js";
import Inventory from "../models/inventory.model.js";
import mongoose from "mongoose";

// =============== CREATE PRODUCT (ADMIN) ===============
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      images,
      price,
      mrp,
      investmentCost,
      categoryId,
      ageGroupId,
      stock,
      specifications,
      isBestSeller,
      isOffer,
    } = req.body;

    // ================= VALIDATION =================

    if (!name || price == null || stock == null || !categoryId || !ageGroupId) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing",
      });
    }
    console.log("Incoming categoryId:", categoryId);

    if (
      Number(price) < 0 ||
      Number(stock) < 0 ||
      (investmentCost != null && Number(investmentCost) < 0) ||
      (mrp != null && Number(mrp) < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Numeric values must be greater than or equal to 0",
      });
    }

    // ================= CATEGORY VALIDATION =================

    const category = await Category.findOne({
      _id: categoryId,
      isActive: true,
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive category",
      });
    }

    // ================= AGE GROUP VALIDATION =================

    const ageGroup = await AgeGroup.findOne({
      _id: ageGroupId,
      isActive: true,
    });

    if (!ageGroup) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive age group",
      });
    }

    // Use transaction to create both product and inventory atomically
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      const product = await Product.create([{
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
      }], { session });

      // Auto-create inventory record with initial stock
      await Inventory.create([{
        productId: product[0]._id,
        totalStock: stock,
        reservedStock: 0
      }], { session });

      await session.commitTransaction();

      res.status(201).json({
        message: "Product created successfully",
        product: product[0],
      });
    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("Create Product Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
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
        isActive: true,
      });

      if (!category) {
        return res.status(400).json({
          message: "Invalid or inactive category",
        });
      }
    }

    if (updates.ageGroupId) {
      const ageGroup = await AgeGroup.findOne({
        _id: updates.ageGroupId,
        isActive: true,
      });

      if (!ageGroup) {
        return res.status(400).json({
          message: "Invalid or inactive age group",
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
    const {
      categoryId,
      search,
      isActive,
      stock,
      isBestSeller,
      minPrice,
      maxPrice,
      sortBy,
      ageGroupId,
    } = req.query;

    const filters = {
      isDeleted: false,
    };

    // Category Filter
    if (categoryId) filters.categoryId = categoryId;

    // Age Group Filter
    if (ageGroupId) filters.ageGroupId = ageGroupId;

    // Status Filter
    if (isActive !== undefined) filters.isActive = isActive === "true";

    // Search
    if (search) filters.name = { $regex: search, $options: "i" };

    // Best Seller
    if (isBestSeller === "true") filters.isBestSeller = true;

    // Stock Filter
    if (stock) {
      if (stock === "in") filters.stock = { $gt: 10 };
      else if (stock === "low") filters.stock = { $gt: 0, $lte: 10 };
      else if (stock === "out") filters.stock = 0;
    }

    // Price Filter
    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.$gte = Number(minPrice);
      if (maxPrice) filters.price.$lte = Number(maxPrice);
    }

    // ===============================
    // AGE GROUP SORT (Aggregation)
    // ===============================
    if (sortBy === "age_asc" || sortBy === "age_desc") {
      const sortDirection = sortBy === "age_asc" ? 1 : -1;

      const products = await Product.aggregate([
        { $match: filters },

        {
          $lookup: {
            from: "agegroups",
            localField: "ageGroupId",
            foreignField: "_id",
            as: "ageGroup",
          },
        },
        { $unwind: "$ageGroup" },

        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: "$category" },

        { $sort: { "ageGroup.minAge": sortDirection } },
      ]);

      return res.json({
        count: products.length,
        products,
      });
    }

    // ===============================
    // NORMAL SORT
    // ===============================
    let sortOptions = { createdAt: -1 };

    switch (sortBy) {
      case "price_asc":
        sortOptions = { price: 1 };
        break;
      case "price_desc":
        sortOptions = { price: -1 };
        break;
      case "newest":
        sortOptions = { createdAt: -1 };
        break;
      case "oldest":
        sortOptions = { createdAt: 1 };
        break;
      case "stock_desc":
        sortOptions = { stock: -1 };
        break;
    }

    const products = await Product.find(filters)
      .populate("categoryId", "name")
      .populate("ageGroupId", "label minAge")
      .sort(sortOptions);

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

    // const product = await Product.findById(productId);

    const product = await Product.findById(productId)
      .populate("categoryId", "name")
      .populate("ageGroupId", "label");

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    return res.json({
      message: "Product fetched successfully",
      product,
    });
  } catch (err) {
    console.error("Admin Product Detail Error:", err);
    return res.status(500).json({
      message: "Failed to fetch product",
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
        return res.status(400).json({ message: "Stock cannot be negative" });
      }

      newStock = Number(stock);
    }

    // --- Increment / Decrement (warehouse / order operations) ---
    if (change !== undefined) {
      newStock = product.stock + Number(change);

      if (newStock < 0) {
        return res.status(400).json({ message: "Stock cannot go below zero" });
      }
    }

    // Safety check — must have at least one field
    if (stock === undefined && change === undefined) {
      return res
        .status(400)
        .json({ message: "Provide either stock or change value" });
    }

    // Use transaction to keep Product.stock and Inventory.totalStock in sync
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      product.stock = newStock;
      await product.save({ session });

      // Update inventory totalStock to match
      const inventory = await Inventory.findOne({ productId: product._id }).session(session);
      
      if (inventory) {
        inventory.totalStock = newStock;
        await inventory.save({ session });
      } else {
        // Create inventory if it doesn't exist (for legacy products)
        await Inventory.create([{
          productId: product._id,
          totalStock: newStock,
          reservedStock: 0
        }], { session });
      }

      await session.commitTransaction();

      return res.json({
        message: "Stock updated successfully",
        stock: product.stock,
      });
    } catch (transactionError) {
      await session.abortTransaction();
      throw transactionError;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("Stock Update Error:", err);
    return res.status(500).json({ message: "Failed to update stock" });
  }
};

// =============== DELETE PRODUCT (ADMIN) ===============
export const deleteProductAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByIdAndDelete(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      message: "Product deleted permanently",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Delete failed" });
  }
};

export const listProducts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const filters = { isActive: true };

    if (req.query.categoryId) filters.categoryId = req.query.categoryId;
    if (req.query.ageGroupId) filters.ageGroupId = req.query.ageGroupId;
    if (req.query.bestSeller) filters.isBestSeller = true;
    if (req.query.offer) filters.isOffer = true;

    if (req.query.search) {
      filters.name = { $regex: req.query.search, $options: "i" };
    }

    const products = await Product.find(filters)
      .populate("categoryId", "name")
      .populate("ageGroupId", "label minAge maxAge")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filters);

    res.json({
      page,
      totalPages: Math.ceil(total / limit),
      totalProducts: total,
      products,
    });
  } catch (err) {
    console.error("List Products Error:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id)
      .populate("categoryId", "name")
      .populate("ageGroupId", "label minAge maxAge");

    if (!product || !product.isActive) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("Product Detail Error:", err);
    res.status(500).json({ message: "Failed to fetch product" });
  }
};

export const getRelatedProducts = async (req, res) => {
  try {
    const { categoryId, productId } = req.query;

    const products = await Product.find({
      categoryId,
      _id: { $ne: productId },
      isActive: true,
    })
      .limit(4)
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    console.error("Related Products Error:", err);
    res.status(500).json({ message: "Failed to fetch related products" });
  }
};

export const getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await Product.findOne({
      slug,
      isActive: true,
    })
      .populate("categoryId", "name")
      .populate("ageGroupId", "name");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("Product Detail Error:", err);
    res.status(500).json({ message: "Failed to fetch product" });
  }
};

export const getLowStockAlerts = async (req, res) => {
  try {
    const threshold = Number(req.query.threshold) || 10;

    const products = await Product.find({
      stock: { $lte: threshold },
      isActive: true,
    })
      .select("name stock categoryId")
      .populate("categoryId", "name")
      .sort({ stock: 1 });

    const formattedProducts = products.map((product) => {
      let severity = "warning";

      if (product.stock <= 3) severity = "critical";
      else if (product.stock <= threshold) severity = "warning";

      return {
        _id: product._id,
        name: product.name,
        stock: product.stock,
        category: product.categoryId?.name || "N/A",
        severity,
      };
    });

    const summary = {
      total: formattedProducts.length,
      critical: formattedProducts.filter((p) => p.severity === "critical")
        .length,
      warning: formattedProducts.filter((p) => p.severity === "warning").length,
    };

    res.json({
      summary,
      products: formattedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch low stock alerts" });
  }
};
