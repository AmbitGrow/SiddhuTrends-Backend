import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

import {
  createProduct,
  updateProduct,
  getAllProductsAdmin,
  getProductByIdAdmin,
  updateProductStock,
} from "../controllers/product.controller.js";

import {
  createCategory,
  getAllCategoriesAdmin,
  updateCategory,
  toggleCategoryStatus,
} from "../controllers/category.controller.js";

import {
  createAgeGroup,
  getAllAgeGroupsAdmin,
  updateAgeGroup,
  toggleAgeGroupStatus
} from "../controllers/ageGroup.controller.js";

const router = express.Router();


router.post("/products", protectRoute, adminRoute, createProduct);
router.put(
  "/products/:productId",
  protectRoute,
  adminRoute,
  updateProduct,
);
router.get("/products", protectRoute, adminRoute, getAllProductsAdmin);
router.get(
  "/products/:productId",
  protectRoute,
  adminRoute,
  getProductByIdAdmin,
);
router.patch(
  "/products/:productId/stock",
  protectRoute,
  adminRoute,
  updateProductStock,
);


router.post("/categories", protectRoute, adminRoute, createCategory);
router.get(
  "/categories",
  protectRoute,
  adminRoute,
  getAllCategoriesAdmin,
);
router.put(
  "/categories/:categoryId",
  protectRoute,
  adminRoute,
  updateCategory,
);
router.patch(
  "/categories/:categoryId/status",
  protectRoute,
  adminRoute,
  toggleCategoryStatus,
);


router.post("/age-groups", protectRoute, adminRoute, createAgeGroup);
router.get("/age-groups", protectRoute, adminRoute, getAllAgeGroupsAdmin);
router.put(
  "/age-groups/:ageGroupId",
  protectRoute,
  adminRoute,
  updateAgeGroup
);
router.patch(
  "/age-groups/:ageGroupId/status",
  protectRoute,
  adminRoute,
  toggleAgeGroupStatus
);

export default router;
