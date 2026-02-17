import express from "express";
import {
  createOrderIntent,
  getMyOrderIntents,
  getMyOrders
} from "../controllers/order.controller.js";
import {protectRoute} from "../middleware/auth.middleware.js";
import { validate, orderSchemas } from "../middleware/validation.js";

const router = express.Router();

router.post("/", protectRoute, validate(orderSchemas.createOrderIntent), createOrderIntent);
// Payment initiation is handled by payment.routes.js at /api/payment/orders/:orderIntentId/pay
router.get("/intents", protectRoute, getMyOrderIntents); // Get pending order intents
router.get("/", protectRoute, getMyOrders); // Get confirmed orders

export default router;