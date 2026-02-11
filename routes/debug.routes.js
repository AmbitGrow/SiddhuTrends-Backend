import express from "express";
import { paymentEventEmitter } from "../utils/paymentEvents.js";

const router = express.Router();

router.get("/test-event", (req, res) => {
  paymentEventEmitter.emit("PAYMENT_VERIFIED", {
    orderIntentId: "TEST_ORDER",
    amount: 199,
    paymentType: "ONLINE"
  });

  res.send("Event emitted manually");
});

export default router;
