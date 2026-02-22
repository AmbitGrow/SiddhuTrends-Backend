import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/product.model.js";
import Inventory from "../models/inventory.model.js";

dotenv.config();

/**
 * Migration Script: Create Inventory Records for Existing Products
 * Run this once to sync all existing products with inventory
 */
async function syncInventory() {
  try {
    console.log("🔄 Starting inventory sync...");
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Get all products
    const products = await Product.find();
    console.log(`📦 Found ${products.length} products`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const product of products) {
      // Check if inventory already exists
      const existingInventory = await Inventory.findOne({ productId: product._id });

      if (existingInventory) {
        // Update totalStock to match product.stock (keep reservedStock as is)
        if (existingInventory.totalStock !== product.stock) {
          existingInventory.totalStock = product.stock;
          await existingInventory.save();
          console.log(`🔄 Updated inventory for: ${product.name} (Stock: ${product.stock})`);
          updated++;
        } else {
          console.log(`⏭️  Skipped: ${product.name} (already in sync)`);
          skipped++;
        }
      } else {
        // Create new inventory record
        await Inventory.create({
          productId: product._id,
          totalStock: product.stock,
          reservedStock: 0
        });
        console.log(`✨ Created inventory for: ${product.name} (Stock: ${product.stock})`);
        created++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total:   ${products.length}`);
    console.log("\n✅ Inventory sync complete!");

  } catch (error) {
    console.error("❌ Sync failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the script
syncInventory();
