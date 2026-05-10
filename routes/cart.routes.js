import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { validate, cartSchemas } from "../middleware/validation.js";

import {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} from "../controllers/cart.controller.js";

const router = express.Router();

router.post("/add", protectRoute, validate(cartSchemas.addToCart), addToCart);

router.get("/", protectRoute, getCart);

router.patch("/update", protectRoute, validate(cartSchemas.updateQuantity), updateCartQuantity);

router.delete("/remove/:productId", protectRoute, removeFromCart);

router.delete("/clear", protectRoute, clearCart);

export default router;
