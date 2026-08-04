import PaymentAudit from "../models/paymentAudit.model.js";

export const logPaymentAudit = async ({
  payment,
  fromStatus,
  toStatus,
  source,
  metadata = null
}) => {
  await PaymentAudit.create({
    paymentId: payment._id,
    orderIntentId: payment.orderIntentId,
    fromStatus,
    toStatus,
    amount: payment.expectedAmount,
    source,
    metadata
  });
};
