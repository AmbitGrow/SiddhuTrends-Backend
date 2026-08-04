import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { validate, cartSchemas } from "../middleware/validation.js";

import {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  mergeCart,
  getCartQuote,
} from "../controllers/cart.controller.js";

const router = express.Router();

router.post("/add", protectRoute, validate(cartSchemas.addToCart), addToCart);

router.get("/", protectRoute, getCart);

router.patch("/update", protectRoute, validate(cartSchemas.updateQuantity), updateCartQuantity);

router.delete("/remove/:productId", protectRoute, removeFromCart);

router.delete("/clear", protectRoute, clearCart);

router.post("/merge", protectRoute, validate(cartSchemas.mergeCart), mergeCart);

router.post("/quote", validate(cartSchemas.mergeCart), getCartQuote);

export default router;
