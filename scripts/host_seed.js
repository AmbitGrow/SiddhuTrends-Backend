import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import AgeGroup from "../models/ageGroup.model.js";
import Inventory from "../models/inventory.model.js";

dotenv.config();

async function main() {
  try {
    console.log("Connecting to MongoDB: " + process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected!");

    // Clear existing
    await Product.deleteMany({});
    await Category.deleteMany({});
    await AgeGroup.deleteMany({});
    await Inventory.deleteMany({});

    // Create Category
    const category = await Category.create({
      name: "Toys",
      description: "Fun toys",
      slug: "toys",
      isActive: true
    });

    // Create AgeGroup
    const ageGroup = await AgeGroup.create({
      name: "Toddlers",
      range: "1-3 Years",
      minAge: 1,
      maxAge: 3,
      description: "Toddler toys",
      label: "Toddlers",
      isActive: true
    });

    // Create Product
    const product = await Product.create({
      name: "Wooden Block Set",
      description: "Creative wooden blocks",
      price: 299,
      mrp: 399,
      investmentCost: 150,
      categoryId: category._id,
      ageGroupId: ageGroup._id,
      stock: 100,
      images: ["https://images.unsplash.com/photo-1515488042361-404e9250afef"],
      isActive: true
    });

    // Create Inventory
    await Inventory.create({
      productId: product._id,
      totalStock: 100,
      reservedStock: 0
    });

    console.log("Seeding successful! Seeded Product:", product._id);
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await mongoose.connection.close();
  }
}

main();
