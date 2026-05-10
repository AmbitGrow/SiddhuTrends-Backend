import mongoose from "mongoose";
import Product from "../models/product.model.js";
import dotenv from "dotenv";

dotenv.config();

// Helper function to generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function fixProductSlugs() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Step 1: Drop the old strict unique index on slug
    try {
      await Product.collection.dropIndex("slug_1");
      console.log("✅ Dropped old slug_1 index");
    } catch (err) {
      console.log("⚠️  No slug_1 index to drop or already dropped");
    }

    // Step 2: Find all products without slugs
    const productsWithoutSlugs = await Product.find({ 
      $or: [{ slug: null }, { slug: "" }, { slug: { $exists: false } }]
    });

    console.log(`\n📦 Found ${productsWithoutSlugs.length} products without slugs`);

    // Step 3: Generate and assign unique slugs
    for (const product of productsWithoutSlugs) {
      let baseSlug = generateSlug(product.name);
      let slug = baseSlug;
      let counter = 1;

      // Check for uniqueness
      while (await Product.findOne({ slug, _id: { $ne: product._id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      product.slug = slug;
      await product.save();
      console.log(`✅ Updated: ${product.name} → ${slug}`);
    }

    // Step 4: Create new sparse unique index
    await Product.collection.createIndex({ slug: 1 }, { unique: true, sparse: true });
    console.log("\n✅ Created new sparse unique index on slug");

    console.log("\n✅ Migration complete!");
    process.exit(0);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

fixProductSlugs();
