import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

import {
  createProduct,
  updateProduct,
  getAllProductsAdmin,
  updateProductStock,
  listProducts,
  getProductById,
  getProductByIdAdmin
} from "../controllers/product.controller.js";

const router = express.Router();

// ADMIN (protected)
router.post("/admin/products", protectRoute, adminRoute, createProduct);
router.put("/admin/products/:productId", protectRoute, adminRoute, updateProduct);
router.get("/admin/products", protectRoute, adminRoute, getAllProductsAdmin);
router.patch("/admin/products/:productId/stock", protectRoute, adminRoute, updateProductStock);
router.get("/admin/products/:productId",protectRoute,adminRoute,getProductByIdAdmin);


// USER (public)
router.get("/products", listProducts);
router.get("/products/:id", getProductById);

export default router;
