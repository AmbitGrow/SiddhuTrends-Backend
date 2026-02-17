import express from "express";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/test-event", protectRoute, adminRoute, (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }

  paymentEventEmitter.emit("PAYMENT_VERIFIED", {
    orderIntentId: "TEST_ORDER",
    amount: 199,
    paymentType: "ONLINE"
  });

  res.send("Event emitted manually");
});

export default router;
