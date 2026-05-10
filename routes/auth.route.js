import express from "express";
import { login, logout, signup, refreshToken, getProfile } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { validate, authSchemas } from "../middleware/validation.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/signup", authLimiter, validate(authSchemas.signup), signup);
router.post("/login", authLimiter, validate(authSchemas.login), login);
router.post("/logout", logout);
router.post("/refresh-token", refreshToken);
router.get("/profile", protectRoute, getProfile);

export default router;
