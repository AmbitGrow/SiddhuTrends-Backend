import express from "express";
import {
  createCategory,
  getAllCategoriesAdmin,
  updateCategory,
  toggleCategoryStatus,
  getActiveCategories
} from "../controllers/category.controller.js";

import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// ADMIN
router.post("/admin/categories", protectRoute, adminRoute, createCategory);
router.get("/admin/categories", protectRoute, adminRoute, getAllCategoriesAdmin);
router.put("/admin/categories/:categoryId", protectRoute, adminRoute, updateCategory);
router.patch(
  "/admin/categories/:categoryId/status",
  protectRoute,
  adminRoute,
  toggleCategoryStatus
);

// PUBLIC
router.get("/categories", getActiveCategories);

export default router;
