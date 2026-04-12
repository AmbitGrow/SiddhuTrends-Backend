import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  getRevenueAnalytics,
  getFinancialAnalytics,
} from "../controllers/analytics.controller.js";

import {
  getUsers,
  toggleUserStatus,
  softDeleteUser,
  resetRiskScore,
  getSingleUser,
  getBlacklistedIPs,
  getLockedAccounts,
  getSecurityEvents,
  getLowStockProducts,
  getCategoryDistribution,
  getDashboardSummary,
  getStockOverview,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  refundOrder,
  getOrderStats,
} from "../controllers/admin.controller.js";

import {
  createProduct,
  updateProduct,
  getAllProductsAdmin,
  getProductByIdAdmin,
  updateProductStock,
  deleteProductAdmin,
  // getLowStockProducts
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
  toggleAgeGroupStatus,
} from "../controllers/ageGroup.controller.js";

const router = express.Router();

router.post("/products", protectRoute, adminRoute, createProduct);
router.put("/products/:productId", protectRoute, adminRoute, updateProduct);
router.get("/products", protectRoute, adminRoute, getAllProductsAdmin);
router.get(
  "/products/:productId",
  protectRoute,
  adminRoute,
  getProductByIdAdmin,
);
router.delete(
  "/product/delete/:productId",
  protectRoute,
  adminRoute,
  deleteProductAdmin,
);
router.patch(
  "/products/:productId/stock",
  protectRoute,
  adminRoute,
  updateProductStock,
);

router.post("/categories", protectRoute, adminRoute, createCategory);
router.get("/categories", protectRoute, adminRoute, getAllCategoriesAdmin);
router.put("/categories/:categoryId", protectRoute, adminRoute, updateCategory);
router.patch(
  "/categories/:categoryId/status",
  protectRoute,
  adminRoute,
  toggleCategoryStatus,
);

router.post("/age-groups", protectRoute, adminRoute, createAgeGroup);
router.get("/age-groups", protectRoute, adminRoute, getAllAgeGroupsAdmin);
router.put("/age-groups/:ageGroupId", protectRoute, adminRoute, updateAgeGroup);
router.patch(
  "/age-groups/:ageGroupId/status",
  protectRoute,
  adminRoute,
  toggleAgeGroupStatus,
);

router.get("/users", protectRoute, adminRoute, getUsers);
router.patch("/users/:id/status", protectRoute, adminRoute, toggleUserStatus);
router.patch("/users/:id/delete", protectRoute, adminRoute, softDeleteUser);
router.patch("/users/:id/reset-risk", protectRoute, adminRoute, resetRiskScore);
router.get("/users/:id", protectRoute, adminRoute, getSingleUser);

router.get("/security/locked", protectRoute, adminRoute, getLockedAccounts);
router.get("/security/ips", protectRoute, adminRoute, getBlacklistedIPs);
router.get("/security/events", protectRoute, adminRoute, getSecurityEvents);

router.get("/dashboard/summary", protectRoute, adminRoute, getDashboardSummary);
router.get(
  "/dashboard/category-distribution",
  protectRoute,
  adminRoute,
  getCategoryDistribution,
);
router.get(
  "/dashboard/low-stock-alerts",
  protectRoute,
  adminRoute,
  getLowStockProducts,
);
router.get(
  "/dashboard/stock-overview",
  protectRoute,
  adminRoute,
  getStockOverview,
);

router.get("/orders/", protectRoute, adminRoute, getAllOrders);
router.get("/orders/stats/overview", protectRoute, adminRoute, getOrderStats);
router.get("/orders/:id", protectRoute, adminRoute, getOrderById);
router.put("/orders/:id/status", protectRoute, adminRoute, updateOrderStatus);
router.put("/orders/:id/refund", protectRoute, adminRoute, refundOrder);

router.get("/analytics/revenue", protectRoute, adminRoute, getRevenueAnalytics);
router.get(
  "/analytics/financial",
  protectRoute,
  adminRoute,
  getFinancialAnalytics,
);


export default router;
