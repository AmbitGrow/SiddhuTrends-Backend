import express from "express";
import { initiatePayment, verifyPayment, razorpayWebhook } from "../controllers/payment.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { validate, paymentSchemas } from "../middleware/validation.js";
import { paymentLimiter, webhookLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post(
  "/payments/orders/:orderIntentId/pay",
  protectRoute,
  paymentLimiter,
  validate(paymentSchemas.initiatePayment),
  initiatePayment
);  

router.post(
  "/payments/verify",
  protectRoute,
  paymentLimiter,
  validate(paymentSchemas.verifyPayment),
  verifyPayment,
);
router.post("/payments/webhook", webhookLimiter, razorpayWebhook);

export default router;
