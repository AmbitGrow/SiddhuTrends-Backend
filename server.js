import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
// import { seedAgeGroups } from "./seed/ageGroup.seed.js";
import categoryroutes from "./routes/category.routes.js";
import agegroouproutes from "./routes/ageGroup.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import debugRoutes from "./routes/debug.routes.js";
import "./services/orderPaymentListener.js";
import cookieParser from "cookie-parser";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/categories", categoryroutes);
app.use("/api/cart", cartRoutes);
app.use("/api/age-groups", agegroouproutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/debug", debugRoutes);


app.listen(PORT, async () => {
  console.log("Server is running on http://localhost:" + PORT);
  await connectDB();
  // await seedAgeGroups();
});
