import express from "express";
import {
  createOrderIntent,
  startPayment,
  getMyOrders
} from "../controllers/order.controller.js";
import {protectRoute} from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", protectRoute, createOrderIntent);
router.post("/:orderIntentId/pay", protectRoute, startPayment);
router.get("/", protectRoute, getMyOrders);

export default router;
