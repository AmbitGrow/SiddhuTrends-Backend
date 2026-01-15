import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import { seedAgeGroups } from "./seed/ageGroup.seed.js";
import categoryRoutes from "./routes/category.routes.js";
import ageGroupRoutes from "./routes/ageGroup.routes.js";
import cookieParser from "cookie-parser";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: "10mb" })); 
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api", productRoutes);
app.use("/api", adminRoutes);
app.use("/api", categoryRoutes);
app.use("/api", cartRoutes);
app.use("/api", ageGroupRoutes);


app.listen(PORT, async() => {
	console.log("Server is running on http://localhost:" + PORT);
	await connectDB();
	await seedAgeGroups();
});


