import User from "../models/user.model.js";
import Product from "../models/product.model.js";

const GST_RATE = 0.18;
const FREE_DELIVERY_THRESHOLD = 1000;
const DELIVERY_FEE = 50;

const calculateCartTotals = (cartItems) => {
  let subtotal = 0;
  let totalQuantity = 0;

  cartItems.forEach((item) => {
    const price = item.product?.price ?? 0;
    subtotal += price * item.quantity;
    totalQuantity += item.quantity;
  });

  const gstAmount = subtotal * GST_RATE;
  const deliveryCharge = subtotal >= FREE_DELIVERY_THRESHOLD || subtotal === 0 ? 0 : DELIVERY_FEE;
  const totalAmount = subtotal + gstAmount + deliveryCharge;

  return {
    subtotal,
    gstAmount,
    deliveryCharge,
    totalAmount,
    itemCount: cartItems.length,
    totalQuantity
  };
};

const getCartWithTotals = async (userId) => {
  const user = await User.findById(userId)
    .populate("cartItems.product", "name price images stock isActive");

  const cartItems = user?.cartItems || [];
  return {
    cartItems,
    totals: calculateCartTotals(cartItems)
  };
};


// ================= ADD TO CART =================
export const addToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, quantity } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        message: "Product ID & valid quantity are required"
      });
    }

    // Check product exists
    const product = await Product.findById(productId);

    if (!product || !product.isActive) {
      return res.status(404).json({
        message: "Product not found or inactive"
      });
    }

    // Stock check
    if (quantity > product.stock) {
      return res.status(400).json({
        message: "Requested quantity exceeds stock"
      });
    }

    // Fetch user
    const user = await User.findById(userId);

    // Check if product already exists in cart
    const existingItem = user.cartItems.find(
      item => item.product.toString() === productId
    );

    if (existingItem) {
      // increase quantity
      const newQty = existingItem.quantity + quantity;

      if (newQty > product.stock) {
        return res.status(400).json({
          message: "Quantity exceeds available stock"
        });
      }

      existingItem.quantity = newQty;
    } else {
      // Add new cart item
      user.cartItems.push({
        product: productId,
        quantity
      });
    }

    await user.save();

    const { cartItems, totals } = await getCartWithTotals(userId);

    res.status(200).json({
      message: "Product added to cart",
      cart: cartItems,
      totals
    });

  } catch (err) {
    console.error("Add To Cart Error:", err);
    res.status(500).json({ message: "Failed to add product to cart" });
  }
};

// ================= GET CART =================
export const getCart = async (req, res) => {
  try {
    const { cartItems, totals } = await getCartWithTotals(req.user._id);

    // If cart is empty — return friendly message
    if (!cartItems.length) {
      return res.json({
        message: "Your cart is empty",
        count: 0,
        cart: [],
        totals
      });
    }

    // Otherwise return cart normally
    res.json({
      message: "Cart fetched successfully",
      count: cartItems.length,
      cart: cartItems,
      totals
    });

  } catch (err) {
    console.error("Get Cart Error:", err);
    res.status(500).json({ message: "Failed to fetch cart" });
  }
};


// ================= UPDATE QUANTITY =================
export const updateCartQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || quantity == null || quantity < 1) {
      return res.status(400).json({
        message: "Product ID & valid quantity required"
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        message: "Quantity exceeds stock"
      });
    }

    const user = await User.findById(req.user._id);

    const cartItem = user.cartItems.find(
      item => item.product.toString() === productId
    );

    if (!cartItem) {
      return res.status(404).json({
        message: "Product not found in cart"
      });
    }

    cartItem.quantity = quantity;

    await user.save();

    const { cartItems, totals } = await getCartWithTotals(req.user._id);

    res.json({
      message: "Cart updated successfully",
      cart: cartItems,
      totals
    });

  } catch (err) {
    console.error("Update Cart Error:", err);
    res.status(500).json({ message: "Failed to update cart" });
  }
};


// ================= REMOVE ITEM =================
export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user._id);

    const existingItem = user.cartItems.find(
      item => item.product.toString() === productId
    );

    // If item does NOT exist
    if (!existingItem) {
      return res.status(404).json({
        message: "Item not found in cart"
      });
    }

    // Remove item
    user.cartItems = user.cartItems.filter(
      item => item.product.toString() !== productId
    );

    await user.save();

    const { cartItems, totals } = await getCartWithTotals(req.user._id);

    return res.json({
      message: "Item removed from cart",
      cart: cartItems,
      totals
    });

  } catch (err) {
    console.error("Remove Cart Item Error:", err);
    return res.status(500).json({ message: "Failed to remove item" });
  }
};



// ================= CLEAR CART =================
export const clearCart = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    user.cartItems = [];
    await user.save();

    res.json({
      message: "Cart cleared successfully",
      cart: [],
      totals: calculateCartTotals([])
    });

  } catch (err) {
    console.error("Clear Cart Error:", err);
    res.status(500).json({ message: "Failed to clear cart" });
  }
};

