import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

import {
  createProduct,
  updateProduct,
  getAllProductsAdmin,
  getProductByIdAdmin,
  updateProductStock
} from "../controllers/adminProduct.controller.js";

const router = express.Router();

// PRODUCT — ADMIN APIs
router.post("/admin/products", protectRoute, adminRoute, createProduct);

router.put("/admin/products/:productId",
  protectRoute,
  adminRoute,
  updateProduct
);

router.get("/admin/products",
  protectRoute,
  adminRoute,
  getAllProductsAdmin
);

router.get("/admin/products/:productId",
  protectRoute,
  adminRoute,
  getProductByIdAdmin
);

router.patch("/admin/products/:productId/stock",
  protectRoute,
  adminRoute,
  updateProductStock
);

export default router;
