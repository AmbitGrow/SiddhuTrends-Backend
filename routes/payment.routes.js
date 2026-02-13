import express from "express";
import { initiatePayment, verifyPayment, razorpayWebhook } from "../controllers/payment.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/orders/:orderIntentId/pay",
  protectRoute,
  initiatePayment
);  

router.post("/verify", verifyPayment);
router.post("/webhook", razorpayWebhook);

export default router;
