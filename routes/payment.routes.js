import express from "express";
import { initiatePayment } from "../controllers/payment.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/orders/:orderIntentId/pay",
  protectRoute,
  initiatePayment
);

export default router;
