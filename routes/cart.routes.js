import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";

import {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} from "../controllers/cart.controller.js";

const router = express.Router();

router.post("/add", protectRoute, addToCart);

router.get("/", protectRoute, getCart);

router.patch("/update", protectRoute, updateCartQuantity);

router.delete("/remove/:productId", protectRoute, removeFromCart);

router.delete("/clear", protectRoute, clearCart);

export default router;
