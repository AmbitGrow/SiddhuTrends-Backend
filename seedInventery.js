import dotenv from "dotenv";
dotenv.config(); // 👈 THIS IS THE FIX

import mongoose from "mongoose";
import Product from "./models/product.model.js";
import Inventory from "./models/inventory.model.js";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found in environment variables");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("✅ MongoDB connected");

const products = await Product.find();

for (const product of products) {
  const exists = await Inventory.findOne({ productId: product._id });

  if (!exists) {
    await Inventory.create({
      productId: product._id,
      totalStock: product.stock,
      reservedStock: 0
    });

    console.log("Inventory created for product:", product._id.toString());
  }
}

console.log("🎉 Inventory seeding complete");
process.exit(0);
