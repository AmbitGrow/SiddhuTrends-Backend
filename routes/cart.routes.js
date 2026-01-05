import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";

import {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart
} from "../controllers/cart.controller.js";

const router = express.Router();

/**
 * USER CART ROUTES (Protected)
 */

// Add product to cart
router.post("/cart/add", protectRoute, addToCart);

// Get user cart
router.get("/cart", protectRoute, getCart);

// Update quantity
router.patch("/cart/update", protectRoute, updateCartQuantity);

// Remove specific product
router.delete("/cart/remove/:productId", protectRoute, removeFromCart);

// Clear entire cart
router.delete("/cart/clear", protectRoute, clearCart);

export default router;
