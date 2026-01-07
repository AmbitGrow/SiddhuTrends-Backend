import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import productRoutes from "./routes/product.routes.js";
import { seedAgeGroups } from "./seed/ageGroup.seed.js";
import categoryroutes from "./routes/category.routes.js";
import cookieParser from "cookie-parser";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: "10mb" })); 
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api", productRoutes);
app.use("/api", categoryroutes);


app.listen(PORT, async() => {
	console.log("Server is running on http://localhost:" + PORT);
	await connectDB();
	await seedAgeGroups();
});


