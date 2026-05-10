import Order from "../models/order.model.js";

export const getRevenueAnalytics = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const revenueData = await Order.aggregate([
      {
        $match: {
          status: { $ne: "REFUNDED" },
          confirmedAt: {
            $gte: startOfYear,
            $lte: endOfYear,
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$confirmedAt" } },
          revenue: { $sum: "$finalAmount" },
        },
      },
      {
        $sort: { "_id.month": 1 },
      },
    ]);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Initialize all 12 months with 0 revenue
    const formattedData = monthNames.map((month, index) => {
      const found = revenueData.find((item) => item._id.month === index + 1);

      return {
        month,
        revenue: found ? Number(found.revenue.toFixed(2)) : 0,
      };
    });

    const totalRevenue = formattedData.reduce(
      (acc, curr) => acc + curr.revenue,
      0,
    );

    res.status(200).json({
      year: currentYear,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      monthlyData: formattedData,
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({
      message: "Failed to fetch analytics data",
    });
  }
};

export const getFinancialAnalytics = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const analytics = await Order.aggregate([
      {
        $match: {
          status: { $ne: "REFUNDED" },
          confirmedAt: {
            $gte: startOfYear,
            $lte: endOfYear,
          },
        },
      },

      {
        $group: {
          _id: { month: { $month: "$confirmedAt" } },
          revenue: { $sum: "$finalAmount" },
          investment: { $sum: "$totalInvestment" },
          profit: { $sum: "$totalProfit" },
          orders: { $sum: 1 },
        },
      },

      {
        $sort: { "_id.month": 1 },
      },
    ]);
    const statusBreakdown = await Order.aggregate([
      {
        $match: {
          confirmedAt: {
            $gte: startOfYear,
            $lte: endOfYear,
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const formattedStatus = {
      CONFIRMED: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      REFUNDED: 0,
    };

    statusBreakdown.forEach((item) => {
      formattedStatus[item._id] = item.count;
    });
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const monthlyData = monthNames.map((month, index) => {
      const found = analytics.find((item) => item._id.month === index + 1);

      return {
        month,
        revenue: found ? Number(found.revenue.toFixed(2)) : 0,
        investment: found ? Number(found.investment.toFixed(2)) : 0,
        profit: found ? Number(found.profit.toFixed(2)) : 0,
      };
    });

    const totalRevenue = monthlyData.reduce((a, b) => a + b.revenue, 0);
    const totalInvestment = monthlyData.reduce((a, b) => a + b.investment, 0);
    const totalProfit = monthlyData.reduce((a, b) => a + b.profit, 0);

    const profitMargin =
      totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0;

    res.status(200).json({
      year: currentYear,
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalInvestment: Number(totalInvestment.toFixed(2)),
        totalProfit: Number(totalProfit.toFixed(2)),
        profitMargin: Number(profitMargin),
        status: formattedStatus,
      },
      monthlyData,
    });
  } catch (error) {
    console.error("Financial Analytics Error:", error);
    res.status(500).json({ message: "Failed to fetch financial analytics" });
  }
};
