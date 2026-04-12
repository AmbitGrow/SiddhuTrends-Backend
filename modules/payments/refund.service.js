import Payment from "../../models/payment.model.js";
import { logPaymentAudit } from "../../utils/paymentAuditLogger.js";
import razorpay from "../../config/razorpay.js";

export const initiateRefund = async ({
  paymentId,
  orderId,
  refundAmount,
  reason,
  session
}) => {
  const payment = await Payment.findById(paymentId).session(session);

  if (!payment) {
    throw new Error("Payment record not found");
  }

  if (payment.refundStatus === "REQUESTED") {
    return { payment, alreadyRequested: true };
  }

  if (payment.refundStatus === "PROCESSED") {
    return { payment, alreadyProcessed: true };
  }

  if (!payment.gatewayPaymentId) {
    throw new Error("Missing gateway payment id for refund");
  }

  const razorpayPayment = await razorpay.payments.fetch(payment.gatewayPaymentId);
  if (!razorpayPayment || razorpayPayment.status !== "captured") {
    throw new Error(`Payment not captured. Current status: ${razorpayPayment?.status}`);
  }

  const amountInPaise = Math.round(refundAmount * 100);

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const refundRes = await fetch(
    `https://api.razorpay.com/v1/payments/${payment.gatewayPaymentId}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ amount: amountInPaise })
    }
  );

  const refundBody = await refundRes.json();
  if (!refundRes.ok) {
    throw new Error(refundBody.error?.description || "Razorpay refund failed");
  }

  payment.refundStatus = "REQUESTED";
  payment.refundId = refundBody.id;
  payment.refundAmount = refundAmount;
  payment.refundReason = reason || "Refund initiated";
  payment.refundInitiatedAt = new Date();
  await payment.save({ session });

  await logPaymentAudit({
    payment,
    fromStatus: "NONE",
    toStatus: "REQUESTED",
    source: "ADMIN_REFUND"
  });

  return { payment, refund: refundBody };
};

export const confirmRefund = async ({ paymentId, session }) => {
  const payment = await Payment.findById(paymentId).session(session);
  if (!payment) {
    throw new Error("Payment record not found");
  }

  if (payment.refundStatus === "PROCESSED") {
    return { payment, alreadyProcessed: true };
  }

  if (payment.refundId) {
    const refundDetails = await razorpay.refunds.fetch(payment.refundId);
    if (refundDetails.status !== "processed") {
      throw new Error(`Refund not yet processed by Razorpay. Current status: ${refundDetails.status}`);
    }
  }

  payment.refundStatus = "PROCESSED";
  payment.refundProcessedAt = new Date();
  await payment.save({ session });

  await logPaymentAudit({
    payment,
    fromStatus: "REQUESTED",
    toStatus: "PROCESSED",
    source: "ADMIN_CONFIRM_REFUND"
  });

  return { payment };
};
