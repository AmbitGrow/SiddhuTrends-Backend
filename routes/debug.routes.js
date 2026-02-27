import express from "express";
import { paymentEventEmitter } from "../utils/paymentEvents.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import Inventory from "../models/inventory.model.js";
import InventoryReservation from "../models/inventoryReservation.model.js";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import OrderIntent from "../models/orderIntent.model.js";
import generateOrderNumber from "../utils/generateOrderNumber.js";
import { expireOrderIntents } from "../jobs/expireOrderIntents.job.js";

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

// 🕐 EXPIRY JOB DIAGNOSTICS

// Manually trigger expiry job
router.post("/run-expiry-job", async (req, res) => {
  try {
    console.log("🔧 Manual expiry job triggered via API");
    await expireOrderIntents();
    res.json({ 
      success: true,
      message: "Expiry job executed. Check server logs for details." 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// List expired but not processed order intents
router.get("/expired-intents", async (req, res) => {
  try {
    const now = new Date();
    
    const expiredIntents = await OrderIntent.find({
      expiresAt: { $lt: now },
      status: {
        $in: ["CREATED", "RESERVED", "PAYMENT_IN_PROGRESS"]
      }
    }).select("_id userId status expiresAt totalAmount createdAt");

    const allExpiredIntents = await OrderIntent.find({
      expiresAt: { $lt: now }
    }).select("_id userId status expiresAt totalAmount createdAt");

    res.json({
      currentTime: now.toISOString(),
      notProcessedYet: {
        count: expiredIntents.length,
        intents: expiredIntents.map(intent => ({
          id: intent._id,
          userId: intent.userId,
          status: intent.status,
          expiresAt: intent.expiresAt,
          totalAmount: intent.totalAmount,
          hoursOverdue: ((now - intent.expiresAt) / (1000 * 60 * 60)).toFixed(2)
        }))
      },
      allExpired: {
        count: allExpiredIntents.length,
        intents: allExpiredIntents.map(intent => ({
          id: intent._id,
          userId: intent.userId,
          status: intent.status,
          expiresAt: intent.expiresAt,
          totalAmount: intent.totalAmount,
          hoursOverdue: ((now - intent.expiresAt) / (1000 * 60 * 60)).toFixed(2)
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check specific order intent
router.get("/order-intent/:orderIntentId", async (req, res) => {
  try {
    const { orderIntentId } = req.params;
    
    const orderIntent = await OrderIntent.findById(orderIntentId);
    
    if (!orderIntent) {
      return res.status(404).json({ 
        message: "OrderIntent not found",
        orderIntentId 
      });
    }

    const now = new Date();
    const isExpired = orderIntent.expiresAt < now;
    const shouldBeExpired = isExpired && ["CREATED", "RESERVED", "PAYMENT_IN_PROGRESS"].includes(orderIntent.status);

    const reservations = await InventoryReservation.find({ 
      orderIntentId 
    });

    res.json({
      orderIntent: {
        id: orderIntent._id,
        userId: orderIntent.userId,
        status: orderIntent.status,
        totalAmount: orderIntent.totalAmount,
        expiresAt: orderIntent.expiresAt,
        createdAt: orderIntent.createdAt
      },
      timing: {
        currentTime: now.toISOString(),
        expiresAt: orderIntent.expiresAt.toISOString(),
        isExpired,
        shouldBeExpired,
        hoursOverdue: isExpired ? ((now - orderIntent.expiresAt) / (1000 * 60 * 60)).toFixed(2) : 0
      },
      reservations: {
        count: reservations.length,
        details: reservations.map(r => ({
          productId: r.productId,
          quantity: r.quantity,
          status: r.status
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 💰 FINANCIAL ANALYTICS DIAGNOSTICS

// View order financial breakdown
router.get("/order-financials/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        message: "Order not found",
        orderId 
      });
    }

    const profitMargin = ((order.totalProfit / order.finalAmount) * 100).toFixed(2);

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      orderType: order.orderType,
      financialSummary: {
        finalAmount: order.finalAmount,
        totalInvestment: order.totalInvestment,
        totalProfit: order.totalProfit,
        profitMargin: profitMargin + "%",
        gstAmount: order.gstAmount
      },
      items: order.items.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        investmentCost: item.investmentCost,
        totalSelling: item.totalSelling,
        totalInvestment: item.totalInvestment,
        itemProfit: item.totalSelling - item.totalInvestment,
        itemMargin: ((item.totalSelling - item.totalInvestment) / item.totalSelling * 100).toFixed(2) + "%"
      })),
      payment: {
        paidAmount: order.paidAmount,
        amountDue: order.amountDue
      },
      timestamps: {
        confirmedAt: order.confirmedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profit analytics summary
router.get("/profit-summary", async (req, res) => {
  try {
    const orders = await Order.find({ 
      status: { $in: ["CONFIRMED", "SHIPPED", "DELIVERED"] }
    });

    if (orders.length === 0) {
      return res.json({
        message: "No orders found",
        summary: {
          totalOrders: 0,
          totalRevenue: 0,
          totalInvestment: 0,
          totalProfit: 0,
          avgProfitMargin: 0
        }
      });
    }

    const summary = orders.reduce((acc, order) => {
      acc.totalRevenue += order.finalAmount;
      acc.totalInvestment += order.totalInvestment;
      acc.totalProfit += order.totalProfit;
      return acc;
    }, {
      totalOrders: orders.length,
      totalRevenue: 0,
      totalInvestment: 0,
      totalProfit: 0
    });

    summary.avgProfitMargin = ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(2) + "%";

    res.json({
      summary,
      topProfitableOrders: orders
        .sort((a, b) => b.totalProfit - a.totalProfit)
        .slice(0, 5)
        .map(o => ({
          orderNumber: o.orderNumber,
          totalProfit: o.totalProfit,
          profitMargin: ((o.totalProfit / o.finalAmount) * 100).toFixed(2) + "%",
          confirmedAt: o.confirmedAt
        }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
