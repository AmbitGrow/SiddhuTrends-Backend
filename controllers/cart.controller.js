import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import { calculateTotals } from "../utils/pricing.js";

const calculateCartTotals = (cartItems) => {
  const items = cartItems.map(item => ({
    price: item.product?.price ?? 0,
    quantity: item.quantity
  }));

  const pricingTotals = calculateTotals(items);
  const totalQuantity = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  return {
    ...pricingTotals,
    itemCount: cartItems.length,
    totalQuantity
  };
};

const getCartWithTotals = async (userId) => {
  const user = await User.findById(userId)
    .populate({
      path: "cartItems.product",
      select: "name price mrp images stock isActive numReviews ageGroupId",
      populate: {
        path: "ageGroupId",
        select: "label"
      }
    });

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


// ================= MERGE CART =================
export const mergeCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "Items must be an array" });
    }

    const user = await User.findById(userId);

    for (const item of items) {
      const { productId, quantity } = item;
      if (!productId || typeof quantity !== "number" || quantity <= 0) continue;

      const product = await Product.findById(productId);
      if (!product || !product.isActive) continue;

      const existingItem = user.cartItems.find(
        (dbItem) => dbItem.product.toString() === productId
      );

      if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        existingItem.quantity = Math.min(newQty, product.stock);
      } else {
        user.cartItems.push({
          product: productId,
          quantity: Math.min(quantity, product.stock)
        });
      }
    }

    await user.save();

    const { cartItems, totals } = await getCartWithTotals(userId);

    res.status(200).json({
      message: "Cart merged successfully",
      cart: cartItems,
      totals
    });
  } catch (err) {
    console.error("Merge Cart Error:", err);
    res.status(500).json({ message: "Failed to merge cart" });
  }
};


// ================= GET CART QUOTE =================
export const getCartQuote = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "Items must be an array" });
    }

    const cartItems = [];

    for (const item of items) {
      const { productId, quantity } = item;
      if (!productId || typeof quantity !== "number" || quantity <= 0) continue;

      const product = await Product.findById(productId)
        .select("name price mrp images stock isActive numReviews ageGroupId")
        .populate({
          path: "ageGroupId",
          select: "label"
        });

      if (!product || !product.isActive) continue;

      cartItems.push({
        product,
        quantity: Math.min(quantity, product.stock)
      });
    }

    const totals = calculateCartTotals(cartItems);

    res.status(200).json({
      message: "Cart quote generated successfully",
      cart: cartItems,
      totals
    });
  } catch (err) {
    console.error("Get Cart Quote Error:", err);
    res.status(500).json({ message: "Failed to generate cart quote" });
  }
};

