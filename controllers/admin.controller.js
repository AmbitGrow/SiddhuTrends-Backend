import User from "../models/user.model.js";
import Product from "../models/product.model.js";
import Category from "../models/category.model.js";
import AgeGroup from "../models/ageGroup.model.js";
import IPBlacklist from "../models/ipBlacklist.model.js";
import SecurityEvent from "../models/securityEvent.model.js";
import Order from "../models/order.model.js";


export const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, role } = req.query;

    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.isActive = status === "active";
    }

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select("-password")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot block admin" });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? "activated" : "blocked"}`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const softDeleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isDeleted = true;
    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: "User soft deleted",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetRiskScore = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    user.riskScore = 0;
    user.isFraudSuspected = false;

    await user.save();

    res.json({
      success: true,
      message: "Risk score reset",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSingleUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("referredBy", "name email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLockedAccounts = async (req, res) => {
  try {
    const lockedUsers = await User.find({
      accountLockedUntil: { $gt: new Date() },
    }).select("-password");

    res.json({
      success: true,
      count: lockedUsers.length,
      users: lockedUsers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getBlacklistedIPs = async (req, res) => {
  try {
    const ips = await IPBlacklist.find({
      blockedUntil: { $gt: new Date() },
    });

    res.json({
      success: true,
      count: ips.length,
      ips,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSecurityEvents = async (req, res) => {
  try {
    const events = await SecurityEvent.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("user", "name email");

    res.json({
      success: true,
      events,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalAgeGroups = await AgeGroup.countDocuments();

    const lowStockCount = await Product.countDocuments({
      stock: { $lt: 10 }
    });

    const investmentResult = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalInvestment: {
            $sum: { $multiply: ["$investmentCost", "$stock"] }
          }
        }
      }
    ]);

    const totalInvestment =
      investmentResult.length > 0
        ? investmentResult[0].totalInvestment
        : 0;

    res.json({
      totalUsers,
      totalProducts,
      totalCategories,
      totalAgeGroups,
      lowStockCount,
      totalInvestment
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCategoryDistribution = async (req, res) => {
  try {
    const result = await Product.aggregate([
      {
        $group: {
          _id: "$categoryId",
          productCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $project: {
          _id: 0,
          categoryName: "$category.name",
          productCount: 1
        }
      }
    ]);

    res.json(result);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStockOverview = async (req, res) => {
  try {
    const result = await Product.aggregate([
      {
        $group: {
          _id: "$categoryId",
          totalStock: { $sum: "$stock" }
        }
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $project: {
          _id: 0,
          categoryName: "$category.name",
          totalStock: 1
        }
      }
    ]);

    res.json(result);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLowStockProducts = async (req, res) => {
  try {
    const threshold = Number(req.query.threshold) || 10;

    const products = await Product.find({
      stock: { $lte: threshold },
      isActive: true,
    })
      .select("name stock categoryId")
      .populate("categoryId", "name")
      .sort({ stock: 1 });

    const formattedProducts = products.map((product) => {
      let severity = "warning";

      if (product.stock <= 3) severity = "critical";
      else if (product.stock <= threshold) severity = "warning";

      return {
        _id: product._id,
        name: product.name,
        stock: product.stock,
        category: product.categoryId?.name || "N/A",
        severity,
      };
    });

    const summary = {
      total: formattedProducts.length,
      critical: formattedProducts.filter(p => p.severity === "critical").length,
      warning: formattedProducts.filter(p => p.severity === "warning").length,
    };

    res.json({
      summary,
      products: formattedProducts,
    });

  } catch (error) {
    res.status(500).json({ message: "Failed to fetch low stock alerts" });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      orderType,
      search,
      sort = "desc"
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (orderType) query.orderType = orderType;

    if (search) {
      query.orderNumber = { $regex: search, $options: "i" };
    }

    const orders = await Order.find(query)
      .populate("userId", "name email phone")
      .sort({ createdAt: sort === "asc" ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const totalOrders = await Order.countDocuments(query);

    res.json({
      success: true,
      total: totalOrders,
      page: Number(page),
      totalPages: Math.ceil(totalOrders / limit),
      orders
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userId", "name email phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, order });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedFlow = {
      CONFIRMED: ["SHIPPED"],
      SHIPPED: ["DELIVERED"],
      DELIVERED: ["REFUNDED"],
      REFUNDED: []
    };

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!allowedFlow[order.status].includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${order.status} to ${status}`
      });
    }

    order.status = status;

    if (status === "DELIVERED") {
      order.deliveredAt = new Date();
    }

    await order.save();

    res.json({
      success: true,
      message: "Order status updated successfully",
      order
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const refundOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "DELIVERED") {
      return res.status(400).json({
        message: "Only delivered orders can be refunded"
      });
    }

    order.status = "REFUNDED";
    await order.save();

    res.json({
      success: true,
      message: "Order refunded successfully",
      order
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();

    const totalRevenue = await Order.aggregate([
      { $match: { status: { $ne: "REFUNDED" } } },
      { $group: { _id: null, revenue: { $sum: "$finalAmount" } } }
    ]);

    const statusStats = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      totalOrders,
      totalRevenue: totalRevenue[0]?.revenue || 0,
      statusStats
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};