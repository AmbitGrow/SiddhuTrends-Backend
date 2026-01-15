import razorpay from "../config/razorpay.js";
import Payment from "../models/payment.model.js";
import OrderIntent from "../models/orderIntent.model.js"; // assumed

const ADVANCE_AMOUNT = 199; // fixed advance (LOCKED)

export const initiatePayment = async (req, res) => {
  try {
    const { orderIntentId } = req.params;
    const { paymentType } = req.body;

    if (!paymentType || !["ONLINE", "PARTIAL_COD"].includes(paymentType)) {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    // 1️⃣ Fetch OrderIntent
    const orderIntent = await OrderIntent.findById(orderIntentId);
    if (!orderIntent) {
      return res.status(404).json({ message: "OrderIntent not found" });
    }

    // 2️⃣ Prevent duplicate payment
    const existingPayment = await Payment.findOne({ orderIntentId });
    if (existingPayment) {
      return res.status(400).json({
        message: "Payment already initiated for this order"
      });
    }

    // 3️⃣ Decide expected amount
    const expectedAmount =
      paymentType === "PARTIAL_COD"
        ? ADVANCE_AMOUNT
        : orderIntent.totalAmount;

    const expectedAmountNumber = Number(expectedAmount);
    if (Number.isNaN(expectedAmountNumber)) {
      throw new Error("Invalid payment amount");
    }

    const razorpayAmount = Math.round(expectedAmountNumber * 100);
    if (!razorpayAmount || razorpayAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    // Temporary sanity log to catch upstream issues quickly
    console.log("Expected amount (₹):", expectedAmountNumber);
    console.log("Razorpay amount (paise):", razorpayAmount);

    // 4️⃣ Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: razorpayAmount, // Razorpay expects paise
      currency: "INR",
      receipt: `order_intent_${orderIntent._id}`,
      notes: {
        orderIntentId: orderIntent._id.toString(),
        paymentType
      }
    });

    // 5️⃣ Create Payment record
    await Payment.create({
      orderIntentId,
      paymentType,
      gatewayOrderId: razorpayOrder.id,
      expectedAmount: expectedAmountNumber,
      paymentStatus: "PENDING"
    });

    // 6️⃣ Send payload to frontend
    return res.json({
      razorpayOrderId: razorpayOrder.id,
      amount: expectedAmount,
      currency: "INR",
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Initiate Payment Error:", error);
    res.status(500).json({ message: "Failed to initiate payment" });
  }
};
