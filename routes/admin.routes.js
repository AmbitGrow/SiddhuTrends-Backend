import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { validate, productSchemas, categorySchemas, ageGroupSchemas, orderSchemas } from "../middleware/validation.js";

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

import {
  cancelOrder,
  approveCancelRequest,
  rejectCancelRequest,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  collectCOD,
  initiateRefund,
  approveRefundRequest,
  rejectRefundRequest,
  confirmRefund
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
router.put("/age-groups/:ageGroupId", protectRoute, adminRoute, updateAgeGroup);
router.patch(
  "/age-groups/:ageGroupId/status",
  protectRoute,
  adminRoute,
  validate(ageGroupSchemas.updateAgeGroup),
  updateAgeGroup
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


// ===== ORDER MANAGEMENT =====
router.get("/orders", protectRoute, adminRoute, getAllOrders);
router.get("/orders/:orderId", protectRoute, adminRoute, getOrderById);
router.patch("/orders/:orderId/status", protectRoute, adminRoute, updateOrderStatus);
router.post("/orders/:orderId/collect-cod", protectRoute, adminRoute, collectCOD);
router.post("/orders/:orderId/cancel", protectRoute, adminRoute, cancelOrder);
router.post("/orders/:orderId/refund", protectRoute, adminRoute, initiateRefund);
router.post("/orders/:orderId/refund/confirm", protectRoute, adminRoute, confirmRefund);
router.post("/orders/:orderId/cancel-request/approve", protectRoute, adminRoute, validate(orderSchemas.adminDecision), approveCancelRequest);
router.post("/orders/:orderId/cancel-request/reject", protectRoute, adminRoute, validate(orderSchemas.adminDecision), rejectCancelRequest);
router.post("/orders/:orderId/refund-request/approve", protectRoute, adminRoute, validate(orderSchemas.adminDecision), approveRefundRequest);
router.post("/orders/:orderId/refund-request/reject", protectRoute, adminRoute, validate(orderSchemas.adminDecision), rejectRefundRequest);

export default router;
