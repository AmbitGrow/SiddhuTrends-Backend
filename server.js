import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import { seedAgeGroups } from "./seed/ageGroup.seed.js";
import paymentRoutes from "./routes/payment.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import ageGroupRoutes from "./routes/ageGroup.routes.js";
import orderRoutes from "./routes/order.routes.js";
import debugRoutes from "./routes/debug.routes.js";
import diagnosticRoutes from "./routes/diagnostic.routes.js";
import cookieParser from "cookie-parser";
import "./services/orderPaymentListener.js";
import { expireOrderIntents } from "./jobs/expireOrderIntents.job.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
	"/api/payments/webhook",
	express.raw({ type: "application/json" })
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Apply general rate limiter to all routes
app.use("/api", generalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/age-groups", ageGroupRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api", paymentRoutes);

// Debug routes (disabled in production)
if (process.env.NODE_ENV !== "production") {
  app.use("/api/debug", debugRoutes);
  app.use("/api/diagnostic", diagnosticRoutes);
}

// 404 handler (must be after all routes)
app.use(notFound);

// Global error handler (must be last)
app.use(errorHandler);


app.listen(PORT, async () => {
  console.log("Server is running on http://localhost:" + PORT);
  await connectDB();
  // await seedAgeGroups();
  
  // 🕐 Start expiry job (runs every 60 seconds)
  console.log("⏰ Starting OrderIntent expiry job...");
  setInterval(async () => {
    try {
      await expireOrderIntents();
    } catch (err) {
      console.error("❌ Expiry job failed:", err);
    }
  }, 60 * 1000);
});
