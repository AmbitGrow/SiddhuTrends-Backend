const Order = require("../models/order.model");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const generateOrderNumber = require("../utils/generateOrderNumber");

exports.createOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. Fetch cart
    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let subtotal = 0;
    let items = [];

    // 2. Validate stock & calculate pricing
    for (const cartItem of cart.items) {
      const product = cartItem.productId;

      if (product.stock < cartItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`
        });
      }

      subtotal += product.price * cartItem.quantity;

      items.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: cartItem.quantity,
        investmentCost: product.investmentCost
      });
    }

    const deliveryCharge = 50; // temp static
    const totalAmount = subtotal + deliveryCharge;

    // 3. Create order
    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId,
      items,
      pricing: {
        subtotal,
        deliveryCharge,
        totalAmount,
        profit: 0 // calculated later
      },
      payment: {
        method: "online",
        status: "pending"
      },
      addressSnapshot: cart.addressSnapshot // assuming saved in cart
    });

    // 4. Clear cart
    cart.items = [];
    await cart.save();

    return res.status(201).json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: totalAmount
      }
    });

  } catch (err) {
    next(err);
  }
};
