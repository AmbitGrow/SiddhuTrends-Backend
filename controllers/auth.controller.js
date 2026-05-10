import { redis } from "../config/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { evaluateRisk } from "../utils/riskEngine.js";
import UserActivity from "../models/userActivity.model.js";
import IPBlacklist from "../models/ipBlacklist.model.js";

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
  await redis.set(
    `refresh_token:${userId}`,
    refreshToken,
    "EX",
    7 * 24 * 60 * 60,
  ); // 7days
};

const setCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true, // prevent XSS attacks, cross site scripting attack
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, // prevent XSS attacks, cross site scripting attack
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const signup = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }
    const user = await User.create({ name, email, password });

    // authenticate
    // const { accessToken, refreshToken } = generateTokens(user._id);
    // await storeRefreshToken(user._id, refreshToken);

    // setCookies(res, accessToken, refreshToken);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: error.message });
  }
};

// export const login = async (req, res) => {
// 	try {
// 		const { email, password } = req.body;
// 		const user = await User.findOne({ email });

// 		if (user && (await user.comparePassword(password))) {
// 			const { accessToken, refreshToken } = generateTokens(user._id);
// 			await storeRefreshToken(user._id, refreshToken);
// 			setCookies(res, accessToken, refreshToken);

// 			res.json({
// 				_id: user._id,
// 				name: user.name,
// 				email: user.email,
// 				role: user.role,
// 			});
// 		} else {
// 			res.status(400).json({ message: "Invalid email or password" });
// 		}
// 	} catch (error) {
// 		console.log("Error in login controller", error.message);
// 		res.status(500).json({ message: error.message });
// 	}
// };

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    const blockedIP = await IPBlacklist.findOne({
      ipAddress: ip,
      blockedUntil: { $gt: new Date() },
    });

    if (blockedIP) {
      return res.status(403).json({
        message: "Too many failed attempts. Try again later.",
      });
    }
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      return res.status(403).json({
        message: "Account temporarily locked. Try again later.",
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      user.loginAttempts += 1;

      // Recalculate risk from login attempts
      user.riskScore = evaluateRisk(user);

      // 🔥 IP-based suspicious detection (ADD HERE)
      const recentFailures = await UserActivity.countDocuments({
        ipAddress: req.ip,
        action: "LOGIN_FAILED",
        createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // last 10 minutes
      });

      if (recentFailures >= 5) {
        user.riskScore += 20;
      }

      // Auto-flag fraud
      if (user.riskScore >= 50) {
        user.isFraudSuspected = true;
      }

      // Auto-block if extremely risky
      if (user.riskScore >= 70) {
        user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
        await SecurityEvent.create({
          user: user._id,
          type: "ACCOUNT_LOCKED",
          ipAddress: req.ip,
          description: "Account locked due to excessive failed login attempts",
        });
      }

      if (recentFailures >= 10) {
        await IPBlacklist.findOneAndUpdate(
          { ipAddress: req.ip },
          {
            ipAddress: req.ip,
            blockedUntil: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
            reason: "Too many failed login attempts",
          },
          { upsert: true },
        );
      }

      await user.save();

      await UserActivity.create({
        user: user._id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        action: "LOGIN_FAILED",
      });

      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 🚫 Blocked or deleted user
    if (!user.isActive || user.isDeleted) {
      return res.status(403).json({
        message: "Account is blocked",
      });
    }

    // ✅ Successful login
    user.loginAttempts = 0;
    user.lastLoginAt = new Date();

    // Recalculate risk again
    user.riskScore = evaluateRisk(user);
    await UserActivity.create({
      user: user._id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      action: "LOGIN_SUCCESS",
    });

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);
    await storeRefreshToken(user._id, refreshToken);
    setCookies(res, accessToken, refreshToken);

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      const decoded = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
      );
      await redis.del(`refresh_token:${decoded.userId}`);
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// this will refresh the access token
export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token provided" });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

    if (storedToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const accessToken = jwt.sign(
      { userId: decoded.userId },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" },
    );

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    res.json({ message: "Token refreshed successfully" });
  } catch (error) {
    console.log("Error in refreshToken controller", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
