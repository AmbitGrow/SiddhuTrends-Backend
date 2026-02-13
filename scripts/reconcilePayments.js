import Payment from "../models/payment.model.js";
import razorpay from "../config/razorpay.js";

export const reconcilePayments = async () => {
  const pendingPayments = await Payment.find({
    paymentStatus: "PENDING"
  });

  for (const payment of pendingPayments) {
    try {
      if (!payment.gatewayPaymentId) {
        continue;
      }

      const gatewayPayment = await razorpay.payments.fetch(
        payment.gatewayPaymentId
      );

      if (gatewayPayment.status === "captured") {
        payment.paymentStatus = "SUCCESS";
        await payment.save();
      }
    } catch (err) {
      console.log("Reconcile error:", err.message);
    }
  }
};
