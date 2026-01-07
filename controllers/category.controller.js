import Category from "../models/category.model.js";

// CREATE CATEGORY (ADMIN)
export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: "Category already exists" });
    }

    const category = await Category.create({ name });
    res.status(201).json({ message: "Category created", category });
  } catch (error) {
    res.status(500).json({ message: "Failed to create category" });
  }
};

// GET ALL CATEGORIES (ADMIN)
export const getAllCategoriesAdmin = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};

// UPDATE CATEGORY (ADMIN)
export const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (name) category.name = name;
    await category.save();

    res.json({ message: "Category updated", category });
  } catch (error) {
    res.status(500).json({ message: "Failed to update category" });
  }
};

// TOGGLE CATEGORY STATUS (ADMIN)
export const toggleCategoryStatus = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    category.isActive = isActive;
    await category.save();

    res.json({
      message: `Category ${isActive ? "enabled" : "disabled"}`,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update category status" });
  }
};

// GET ACTIVE CATEGORIES (PUBLIC)
export const getActiveCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};

