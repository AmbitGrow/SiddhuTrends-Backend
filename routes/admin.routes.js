import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { validate, productSchemas, categorySchemas, ageGroupSchemas } from "../middleware/validation.js";

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

import {
  cancelOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus
} from "../controllers/adminOrder.controller.js";

const router = express.Router();


router.post("/products", protectRoute, adminRoute, validate(productSchemas.createProduct), createProduct);
router.put(
  "/products/:productId",
  protectRoute,
  adminRoute,
  validate(productSchemas.updateProduct),
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
  validate(productSchemas.updateStock),
  updateProductStock,
);


router.post("/categories", protectRoute, adminRoute, validate(categorySchemas.createCategory), createCategory);
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
  validate(categorySchemas.updateCategory),
  updateCategory,
);
router.patch(
  "/categories/:categoryId/status",
  protectRoute,
  adminRoute,
  validate(categorySchemas.toggleStatus),
  toggleCategoryStatus,
);


router.post("/age-groups", protectRoute, adminRoute, validate(ageGroupSchemas.createAgeGroup), createAgeGroup);
router.get("/age-groups", protectRoute, adminRoute, getAllAgeGroupsAdmin);
router.put(
  "/age-groups/:ageGroupId",
  protectRoute,
  adminRoute,
  validate(ageGroupSchemas.updateAgeGroup),
  updateAgeGroup
);
router.patch(
  "/age-groups/:ageGroupId/status",
  protectRoute,
  adminRoute,
  validate(ageGroupSchemas.toggleStatus),
  toggleAgeGroupStatus
);

// ===== ORDER MANAGEMENT =====
router.get("/orders", protectRoute, adminRoute, getAllOrders);
router.get("/orders/:orderId", protectRoute, adminRoute, getOrderById);
router.patch("/orders/:orderId/status", protectRoute, adminRoute, updateOrderStatus);
router.post("/orders/:orderId/cancel", protectRoute, adminRoute, cancelOrder);

export default router;
