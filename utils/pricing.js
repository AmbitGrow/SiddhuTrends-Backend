const GST_RATE = 0.18;

/**
 * Calculates pricing totals given an array of items with prices and quantities
 * @param {Array<{ price: number, quantity: number }>} items 
 * @returns {{ subtotal: number, gstAmount: number, deliveryCharge: number, totalAmount: number }}
 */
export const calculateTotals = (items) => {
  let subtotal = 0;
  let gstAmount = 0;

  items.forEach((item) => {
    const price = item.price || 0;
    const basePrice = price * item.quantity;
    const gst = basePrice * GST_RATE;
    subtotal += basePrice;
    gstAmount += gst;
  });

  const deliveryCharge = subtotal >= 1000 ? 0 : 50;
  const totalAmount = subtotal + gstAmount + deliveryCharge;

  return {
    subtotal,
    gstAmount,
    deliveryCharge,
    totalAmount
  };
};
