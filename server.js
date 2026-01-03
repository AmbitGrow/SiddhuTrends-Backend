import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.route.js";
import cookieParser from "cookie-parser";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: "10mb" })); 
app.use(cookieParser());

app.use("/api/auth", authRoutes);



app.listen(PORT, () => {
	console.log("Server is running on http://localhost:" + PORT);
	connectDB();
});


