import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "../config/db.js";
import { createOrderIntent } from "../controllers/order.controller.js";
import { createOrderFromPayment } from "../services/orderCreation.service.js";
import { expireOrderIntents } from "../jobs/expireOrderIntents.job.js";
import { restockOnCancel } from "../services/inventory.service.js";
import { transitionOrder } from "../domain/order.state.js";

import User from "../models/user.model.js";
import Category from "../models/category.model.js";
import AgeGroup from "../models/ageGroup.model.js";
import Product from "../models/product.model.js";
import Inventory from "../models/inventory.model.js";
import OrderIntent from "../models/orderIntent.model.js";
import OrderItem from "../models/orderItem.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import InventoryReservation from "../models/inventoryReservation.model.js";
import InventoryLog from "../models/inventoryLog.model.js";

dotenv.config();

const runId = `it-${Date.now()}`;
const createdIds = {
  users: [],
  categories: [],
  ageGroups: [],
  products: [],
  inventories: [],
  orderIntents: [],
  orders: [],
  payments: []
};

const results = [];
let referenceOrderId = null;

function recordResult(name, passed, details) {
  results.push({ name, passed, details });
  const mark = passed ? "PASS" : "FAIL";
  console.log(`\n[${mark}] ${name}`);
  if (details) {
    console.log(details);
  }
}

function createMockRes() {
  const out = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };
  return out;
}

async function setupBaseData(label) {
  const category = await Category.create({ name: `${runId}-cat-${label}` });
  const ageGroup = await AgeGroup.create({
    label: `${runId}-age-${label}`,
    minAge: 3,
    maxAge: 8,
    unit: "years"
  });
  const user = await User.create({
    name: `User ${label}`,
    email: `${runId}-${label}@mail.test`,
    password: "pass1234",
    role: "customer"
  });

  createdIds.categories.push(category._id);
  createdIds.ageGroups.push(ageGroup._id);
  createdIds.users.push(user._id);

  return { category, ageGroup, user };
}

async function createProductWithInventory(base, label, stock = 25, price = 300, investmentCost = 170) {
  const product = await Product.create({
    name: `${runId}-product-${label}`,
    description: "integrity-test-product",
    images: [],
    price,
    investmentCost,
    categoryId: base.category._id,
    ageGroupId: base.ageGroup._id,
    stock,
    isActive: true
  });

  const inventory = await Inventory.create({
    productId: product._id,
    totalStock: stock,
    reservedStock: 0
  });

  createdIds.products.push(product._id);
  createdIds.inventories.push(inventory._id);

  return { product, inventory };
}

async function createIntentForProduct(user, product, quantity) {
  const req = {
    user: { _id: user._id },
    body: {
      items: [{ productId: product._id, quantity }],
      deliveryAddress: {
        fullName: "Test User",
        phone: "9999999999",
        addressLine1: "123 Street",
        addressLine2: "Near Park",
        city: "Chennai",
        state: "TN",
        pincode: "600001"
      }
    }
  };
  const res = createMockRes();
  await createOrderIntent(req, res);

  if (res.statusCode >= 400) {
    throw new Error(`createOrderIntent failed: ${JSON.stringify(res.payload)}`);
  }

  const intentId = res.payload?.orderIntentId;
  const orderIntent = await OrderIntent.findById(intentId);
  // Payment flow expects PAYMENT_IN_PROGRESS before conversion.
  orderIntent.status = "PAYMENT_IN_PROGRESS";
  await orderIntent.save();
  createdIds.orderIntents.push(orderIntent._id);
  return orderIntent;
}

async function createSuccessPayment(orderIntent, paymentType = "ONLINE") {
  const expectedAmount = paymentType === "PARTIAL_COD" ? 199 : orderIntent.totalAmount;

  const payment = await Payment.create({
    orderIntentId: orderIntent._id,
    paymentType,
    gatewayOrderId: `${runId}-go-${orderIntent._id}`,
    gatewayPaymentId: `${runId}-gp-${orderIntent._id}`,
    expectedAmount,
    paidAmount: expectedAmount,
    paymentStatus: "SUCCESS",
    verifiedAt: new Date()
  });

  createdIds.payments.push(payment._id);
  return payment;
}

async function loadOrderByIntent(orderIntentId) {
  return Order.findOne({ orderIntentId });
}

async function cancelOrderAtomic(orderId, reason = "integrity test cancel") {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      throw new Error("Order not found");
    }

    const newStatus = transitionOrder(order.status, "CANCELLED");

    if (order.inventoryConsumed) {
      await restockOnCancel(order, session);
      order.inventoryConsumed = false;
    }

    order.status = newStatus;
    order.cancelledAt = new Date();
    order.cancelReason = reason;
    await order.save({ session });

    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function runTest1(base) {
  const { product } = await createProductWithInventory(base, "t1", 20, 250, 120);
  const orderIntent = await createIntentForProduct(base.user, product, 2);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");

  const order = await createOrderFromPayment(
    orderIntent._id.toString(),
    payment._id.toString(),
    "ONLINE"
  );
  createdIds.orders.push(order._id);
  referenceOrderId = order._id;

  const inv = await Inventory.findOne({ productId: product._id });
  const intentAfter = await OrderIntent.findById(orderIntent._id);

  const passed =
    !!order &&
    order.status === "CONFIRMED" &&
    order.inventoryConsumed === true &&
    inv.reservedStock === 0 &&
    inv.totalStock === 18 &&
    intentAfter.status === "CONVERTED";

  recordResult(
    "TEST 1 - Happy Path",
    passed,
    `order=${order?._id} status=${order?.status} inventoryConsumed=${order?.inventoryConsumed} reserved=${inv.reservedStock} total=${inv.totalStock} intent=${intentAfter.status}`
  );
}

async function runTest2(base) {
  const { product } = await createProductWithInventory(base, "t2", 30, 400, 250);
  const orderIntent = await createIntentForProduct(base.user, product, 3);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");

  const calls = [
    createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE"),
    createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE")
  ];
  await Promise.allSettled(calls);

  const orders = await Order.find({ orderIntentId: orderIntent._id });
  orders.forEach((o) => createdIds.orders.push(o._id));
  const dedLogs = await InventoryLog.countDocuments({
    orderIntentId: orderIntent._id,
    action: "DEDUCT"
  });
  const inv = await Inventory.findOne({ productId: product._id });

  const passed =
    orders.length === 1 &&
    dedLogs === 1 &&
    inv.totalStock >= 0 &&
    inv.reservedStock >= 0;

  recordResult(
    "TEST 2 - Double Payment Attack",
    passed,
    `orders=${orders.length} deductLogs=${dedLogs} reserved=${inv.reservedStock} total=${inv.totalStock}`
  );
}

async function runTest3(base) {
  const { product } = await createProductWithInventory(base, "t3", 15, 220, 140);
  const orderIntent = await createIntentForProduct(base.user, product, 1);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");

  await createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE");
  await createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE");

  const orders = await Order.find({ orderIntentId: orderIntent._id });
  orders.forEach((o) => createdIds.orders.push(o._id));
  const dedLogs = await InventoryLog.countDocuments({
    orderIntentId: orderIntent._id,
    action: "DEDUCT"
  });

  const passed = orders.length === 1 && dedLogs === 1;
  recordResult(
    "TEST 3 - Webhook First Simulation",
    passed,
    `orders=${orders.length} deductLogs=${dedLogs}`
  );
}

async function runTest4(base) {
  const { product } = await createProductWithInventory(base, "t4", 20, 180, 90);
  const orderIntent = await createIntentForProduct(base.user, product, 2);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");

  orderIntent.expiresAt = new Date(Date.now() - 1000);
  await orderIntent.save();

  const race = await Promise.allSettled([
    createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE"),
    expireOrderIntents()
  ]);

  const order = await Order.findOne({ orderIntentId: orderIntent._id });
  if (order) {
    createdIds.orders.push(order._id);
  }
  const intentAfter = await OrderIntent.findById(orderIntent._id);

  const confirmedPath = !!order && intentAfter.status === "CONVERTED";
  const expiredPath = !order && intentAfter.status === "EXPIRED";
  const passed = confirmedPath || expiredPath;

  recordResult(
    "TEST 4 - Expiry vs Payment Race",
    passed,
    `raceResults=${race.map((r) => r.status).join(",")} order=${order?._id || "none"} intentStatus=${intentAfter.status}`
  );
}

async function runTest5(base) {
  const { product } = await createProductWithInventory(base, "t5", 12, 300, 180);
  const orderIntent = await createIntentForProduct(base.user, product, 2);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");
  const order = await createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE");
  createdIds.orders.push(order._id);

  await cancelOrderAtomic(order._id.toString(), "test5 cancel");

  const orderAfter = await Order.findById(order._id);
  const inv = await Inventory.findOne({ productId: product._id });
  const restockLogs = await InventoryLog.countDocuments({
    orderIntentId: orderIntent._id,
    action: "RESTOCK_CANCEL"
  });

  const passed =
    orderAfter.status === "CANCELLED" &&
    inv.totalStock === 12 &&
    inv.reservedStock === 0 &&
    restockLogs === 1;

  recordResult(
    "TEST 5 - Cancel Flow",
    passed,
    `status=${orderAfter.status} total=${inv.totalStock} reserved=${inv.reservedStock} restockLogs=${restockLogs}`
  );
}

async function runTest6(base) {
  const { product } = await createProductWithInventory(base, "t6", 10, 200, 100);
  const orderIntent = await createIntentForProduct(base.user, product, 1);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");
  const order = await createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE");
  createdIds.orders.push(order._id);

  await cancelOrderAtomic(order._id.toString(), "first cancel");
  let secondCancelError = null;
  try {
    await cancelOrderAtomic(order._id.toString(), "second cancel");
  } catch (err) {
    secondCancelError = err;
  }

  const restockLogs = await InventoryLog.countDocuments({
    orderIntentId: orderIntent._id,
    action: "RESTOCK_CANCEL"
  });
  const inv = await Inventory.findOne({ productId: product._id });

  const passed = !!secondCancelError && restockLogs === 1 && inv.totalStock === 10;

  recordResult(
    "TEST 6 - Double Cancel Attack",
    passed,
    `secondCancelError=${secondCancelError ? secondCancelError.message : "none"} restockLogs=${restockLogs} total=${inv.totalStock}`
  );
}

async function runTest7(base) {
  const { product: p1 } = await createProductWithInventory(base, "t7s", 10, 200, 100);
  const i1 = await createIntentForProduct(base.user, p1, 1);
  const pay1 = await createSuccessPayment(i1, "ONLINE");
  const o1 = await createOrderFromPayment(i1._id.toString(), pay1._id.toString(), "ONLINE");
  createdIds.orders.push(o1._id);
  o1.status = "SHIPPED";
  await o1.save();

  const invBeforeS = await Inventory.findOne({ productId: p1._id });
  let shippedError = null;
  try {
    await cancelOrderAtomic(o1._id.toString(), "cancel shipped");
  } catch (err) {
    shippedError = err;
  }
  const invAfterS = await Inventory.findOne({ productId: p1._id });

  const { product: p2 } = await createProductWithInventory(base, "t7d", 10, 200, 100);
  const i2 = await createIntentForProduct(base.user, p2, 1);
  const pay2 = await createSuccessPayment(i2, "ONLINE");
  const o2 = await createOrderFromPayment(i2._id.toString(), pay2._id.toString(), "ONLINE");
  createdIds.orders.push(o2._id);
  o2.status = "DELIVERED";
  await o2.save();

  const invBeforeD = await Inventory.findOne({ productId: p2._id });
  let deliveredError = null;
  try {
    await cancelOrderAtomic(o2._id.toString(), "cancel delivered");
  } catch (err) {
    deliveredError = err;
  }
  const invAfterD = await Inventory.findOne({ productId: p2._id });

  const passed =
    !!shippedError &&
    !!deliveredError &&
    invBeforeS.totalStock === invAfterS.totalStock &&
    invBeforeD.totalStock === invAfterD.totalStock;

  recordResult(
    "TEST 7 - Invalid Cancel",
    passed,
    `shippedError=${shippedError ? "yes" : "no"} deliveredError=${deliveredError ? "yes" : "no"}`
  );
}

async function runTest8(base) {
  const { product } = await createProductWithInventory(base, "t8", 10, 250, 140);
  const orderIntent = await createIntentForProduct(base.user, product, 2);
  const payment = await createSuccessPayment(orderIntent, "ONLINE");

  // Force failure after consumeStock by removing product used for financial snapshot.
  await Product.deleteOne({ _id: product._id });

  let failed = false;
  try {
    await createOrderFromPayment(orderIntent._id.toString(), payment._id.toString(), "ONLINE");
  } catch (_err) {
    failed = true;
  }

  const orderCount = await Order.countDocuments({ orderIntentId: orderIntent._id });
  const intentAfter = await OrderIntent.findById(orderIntent._id);
  const reservation = await InventoryReservation.findOne({ orderIntentId: orderIntent._id });
  const inv = await Inventory.findOne({ productId: product._id });

  const passed =
    failed &&
    orderCount === 0 &&
    intentAfter.status === "PAYMENT_IN_PROGRESS" &&
    reservation?.status === "ACTIVE" &&
    inv?.reservedStock === 2 &&
    inv?.totalStock === 10;

  recordResult(
    "TEST 8 - Transaction Failure Simulation",
    passed,
    `failed=${failed} orderCount=${orderCount} intent=${intentAfter.status} reservation=${reservation?.status} reserved=${inv?.reservedStock} total=${inv?.totalStock}`
  );
}

async function runTest9() {
  const invalid = await Inventory.find({
    $or: [
      { reservedStock: { $lt: 0 } },
      { totalStock: { $lt: 0 } },
      { $expr: { $gt: ["$reservedStock", "$totalStock"] } }
    ]
  });

  const passed = invalid.length === 0;
  recordResult(
    "TEST 9 - Inventory Integrity Audit",
    passed,
    `invalidDocs=${invalid.length}`
  );
}

async function runTest10() {
  if (!referenceOrderId) {
    recordResult("TEST 10 - Order Data Integrity", false, "No reference order id captured from test run");
    return;
  }

  const candidate = await Order.findById(referenceOrderId);

  if (!candidate) {
    recordResult("TEST 10 - Order Data Integrity", false, "No order found to audit");
    return;
  }

  const itemSnapshots = await OrderItem.find({ orderIntentId: candidate.orderIntentId });
  const intent = await OrderIntent.findById(candidate.orderIntentId);
  const hasTracking = Array.isArray(candidate.trackingHistory) && candidate.trackingHistory.length > 0;
  const hasAddress = !!candidate.deliveryAddress;

  const passed =
    candidate.items.length === itemSnapshots.length &&
    intent &&
    Number(candidate.finalAmount) === Number(intent.totalAmount) &&
    hasTracking &&
    hasAddress;

  recordResult(
    "TEST 10 - Order Data Integrity",
    passed,
    `items(order/orderItem)=${candidate.items.length}/${itemSnapshots.length} amount(order/intent)=${candidate.finalAmount}/${intent?.totalAmount} hasAddress=${hasAddress} hasTracking=${hasTracking}`
  );
}

async function cleanup() {
  await Order.deleteMany({ _id: { $in: createdIds.orders } });
  await Payment.deleteMany({ _id: { $in: createdIds.payments } });
  await OrderItem.deleteMany({ orderIntentId: { $in: createdIds.orderIntents } });
  await InventoryReservation.deleteMany({ orderIntentId: { $in: createdIds.orderIntents } });
  await InventoryLog.deleteMany({ orderIntentId: { $in: createdIds.orderIntents } });
  await OrderIntent.deleteMany({ _id: { $in: createdIds.orderIntents } });
  await Inventory.deleteMany({ _id: { $in: createdIds.inventories } });
  await Product.deleteMany({ _id: { $in: createdIds.products } });
  await User.deleteMany({ _id: { $in: createdIds.users } });
  await Category.deleteMany({ _id: { $in: createdIds.categories } });
  await AgeGroup.deleteMany({ _id: { $in: createdIds.ageGroups } });
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is required for integrity tests.");
    process.exit(1);
  }

  await connectDB();
  const base = await setupBaseData("base");

  try {
    await runTest1(base);
    await runTest2(base);
    await runTest3(base);
    await runTest4(base);
    await runTest5(base);
    await runTest6(base);
    await runTest7(base);
    await runTest8(base);
    await runTest9();
    await runTest10();

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    console.log("\n================ INTEGRITY SUMMARY ================");
    console.log(`Run ID: ${runId}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failed > 0) {
      console.log("Failed tests:", results.filter((r) => !r.passed).map((r) => r.name).join(", "));
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
    await mongoose.connection.close();
  }
}

main().catch(async (err) => {
  console.error("Integrity run failed:", err);
  try {
    await cleanup();
    await mongoose.connection.close();
  } catch (_ignored) {
    // best effort cleanup
  }
  process.exit(1);
});
