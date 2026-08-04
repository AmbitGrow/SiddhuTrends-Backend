import express from "express";
import cors from "cors";
import { checkMongoReadiness, connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import { seedAgeGroups } from "./seed/ageGroup.seed.js";
import paymentRoutes from "./routes/payment.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import ageGroupRoutes from "./routes/ageGroup.routes.js";
import orderRoutes from "./routes/order.routes.js";
import { redis } from "./config/redis.js";
import { env, validateEnv } from "./config/env.js";

import diagnosticRoutes from "./routes/diagnostic.routes.js";
import cookieParser from "cookie-parser";
import "./services/orderPaymentListener.js";
import "./services/orderLifecycleListener.js";
import { expireOrderIntents } from "./jobs/expireOrderIntents.job.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger.js";

validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const configuredOrigins = env.allowedOrigins;

app.disable("x-powered-by");
app.set("trust proxy", env.trustProxy);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const corsError = new Error("Origin not allowed by CORS");
      corsError.statusCode = 403;
      callback(corsError);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    optionsSuccessStatus: 204,
    maxAge: env.isProduction ? 600 : 0,
  }),
);

app.use(securityHeaders);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/ready", async (req, res) => {
  const issues = [];

  const mongoReadiness = await checkMongoReadiness();
  if (!mongoReadiness.ready) {
    issues.push(mongoReadiness.message);
  }

  if (redis.status !== "ready") {
    issues.push(`Redis is ${redis.status}`);
  } else {
    try {
      await redis.ping();
    } catch (error) {
      issues.push(`Redis readiness check failed: ${error.message}`);
    }
  }

  if (issues.length > 0) {
    return res.status(503).json({
      status: "not ready",
      message: issues.join("; "),
    });
  }

  return res.status(200).json({ status: "ready" });
});

app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb", parameterLimit: 100 }));
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

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Diagnostic routes (disabled in production)
if (process.env.NODE_ENV !== "production") {
  app.use("/api/diagnostic", diagnosticRoutes);
}

// 404 handler (must be after all routes)
app.use(notFound);

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server is running on port ${PORT}`);
  await connectDB();
  // await seedAgeGroups();
  
  // 🕐 Start expiry job (runs every 60 seconds)
  console.log("⏰ Starting OrderIntent expiry job...");
  
  // Run immediately on startup
  try {
    await expireOrderIntents();
  } catch (err) {
    console.error("❌ Initial expiry job failed:", err);
  }
  
  // Then run every 60 seconds
  setInterval(async () => {
    try {
      await expireOrderIntents();
    } catch (err) {
      console.error("❌ Expiry job failed:", err);
    }
  }, 60 * 1000);
});
