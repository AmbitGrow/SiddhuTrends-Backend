import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { connectDB } from "./config/db.js";
import { seedAgeGroups } from "./seed/ageGroup.seed.js";

import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.routes.js";
import categoryroutes from "./routes/category.routes.js";
import agegroouproutes from "./routes/ageGroup.routes.js";
import orderRoutes from "./routes/order.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: "10mb" })); 
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api", productRoutes);
app.use("/api", categoryroutes);
app.use("/api", agegroouproutes);
app.use("/api/orders",orderRoutes);


app.listen(PORT, async() => {
	console.log("Server is running on http://localhost:" + PORT);
	await connectDB();
	await seedAgeGroups();
});


