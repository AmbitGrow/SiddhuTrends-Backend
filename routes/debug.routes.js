import express from "express";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import Inventory from "../models/inventory.model.js";
import InventoryReservation from "../models/inventoryReservation.model.js";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import generateOrderNumber from "../utils/generateOrderNumber.js";

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

// Check inventory status for a product
router.get("/inventory/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    
    const inventory = await Inventory.findOne({ productId });
    
    if (!inventory) {
      return res.status(404).json({ 
        message: "No inventory record found for this product",
        productId 
      });
    }

    const activeReservations = await InventoryReservation.find({
      productId,
      status: "ACTIVE"
    });

    const availableStock = inventory.totalStock - inventory.reservedStock;

    res.json({
      productId,
      totalStock: inventory.totalStock,
      reservedStock: inventory.reservedStock,
      availableStock,
      activeReservations: activeReservations.length,
      reservationDetails: activeReservations.map(r => ({
        orderIntentId: r.orderIntentId,
        quantity: r.quantity,
        expiresAt: r.expiresAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check multiple products inventory at once
router.post("/inventory/batch", async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({ message: "productIds array required" });
    }

    const inventories = await Inventory.find({ 
      productId: { $in: productIds } 
    }).populate('productId', 'name price');

    const results = await Promise.all(productIds.map(async (productId) => {
      const inventory = inventories.find(inv => 
        inv.productId._id.toString() === productId.toString()
      );

      if (!inventory) {
        return {
          productId,
          status: "NO_INVENTORY",
          message: "No inventory record exists"
        };
      }

      const activeReservations = await InventoryReservation.countDocuments({
        productId,
        status: "ACTIVE"
      });

      const availableStock = inventory.totalStock - inventory.reservedStock;

      return {
        productId,
        status: availableStock > 0 ? "AVAILABLE" : "OUT_OF_STOCK",
        totalStock: inventory.totalStock,
        reservedStock: inventory.reservedStock,
        availableStock,
        activeReservations
      };
    }));

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync inventory records from existing products
router.post("/sync-inventory", protectRoute, adminRoute, async (req, res) => {
  try {
    const products = await Product.find();
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const product of products) {
      try {
        const existingInventory = await Inventory.findOne({ productId: product._id });

        if (existingInventory) {
          if (existingInventory.totalStock !== product.stock) {
            existingInventory.totalStock = product.stock;
            await existingInventory.save();
            updated++;
          } else {
            skipped++;
          }
        } else {
          await Inventory.create({
            productId: product._id,
            totalStock: product.stock,
            reservedStock: 0
          });
          created++;
        }
      } catch (err) {
        errors.push({
          productId: product._id,
          productName: product.name,
          error: err.message
        });
      }
    }

    res.json({
      message: "Inventory sync completed",
      summary: {
        totalProducts: products.length,
        created,
        updated,
        skipped,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check for orders with null orderNumber
router.get("/orders/null-numbers", protectRoute, adminRoute, async (req, res) => {
  try {
    const ordersWithNullNumber = await Order.find({ 
      orderNumber: null 
    });

    res.json({
      count: ordersWithNullNumber.length,
      orders: ordersWithNullNumber.map(o => ({
        _id: o._id,
        orderIntentId: o.orderIntentId,
        userId: o.userId,
        orderNumber: o.orderNumber,
        status: o.status,
        confirmedAt: o.confirmedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix orders with null orderNumber
router.post("/orders/fix-null-numbers", protectRoute, adminRoute, async (req, res) => {
  try {
    const ordersWithNullNumber = await Order.find({ 
      orderNumber: null 
    });

    let fixed = 0;
    let errors = [];

    for (const order of ordersWithNullNumber) {
      try {
        order.orderNumber = generateOrderNumber();
        await order.save();
        fixed++;
      } catch (err) {
        errors.push({
          orderId: order._id,
          error: err.message
        });
      }
    }

    res.json({
      message: "Order numbers fixed",
      totalFound: ordersWithNullNumber.length,
      fixed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete orders with null orderNumber (use with caution!)
router.delete("/orders/null-numbers", protectRoute, adminRoute, async (req, res) => {
  try {
    const result = await Order.deleteMany({ 
      orderNumber: null 
    });

    res.json({
      message: "Orders with null orderNumber deleted",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
