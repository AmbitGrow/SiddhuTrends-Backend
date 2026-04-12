import express from "express";
import {
  createOrderIntent,
  createOrderIntentFromCart,
  getMyOrderIntents,
  getMyOrders,
  getOrderById,
  getOrderTracking,
  requestOrderCancel,
  requestOrderRefund
} from "../controllers/order.controller.js";
import {protectRoute} from "../middleware/auth.middleware.js";
import { validate, orderSchemas } from "../middleware/validation.js";

const router = express.Router();

router.post("/", protectRoute, validate(orderSchemas.createOrderIntent), createOrderIntent);
router.post("/from-cart", protectRoute, validate(orderSchemas.createOrderIntentFromCart), createOrderIntentFromCart);
// Payment initiation is handled by payment.routes.js at /api/payment/orders/:orderIntentId/pay
router.post("/:orderId/cancel-request", protectRoute, validate(orderSchemas.requestCancel), requestOrderCancel);
router.post("/:orderId/refund-request", protectRoute, validate(orderSchemas.requestRefund), requestOrderRefund);
router.get("/:orderId/tracking", protectRoute, getOrderTracking);
router.get("/intents", protectRoute, getMyOrderIntents); // Get pending order intents
router.get("/:orderId", protectRoute, getOrderById);
router.get("/", protectRoute, getMyOrders); // Get confirmed orders

export default router;