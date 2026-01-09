const express = require("express");
const router = express.Router();
const { createOrder } = require("../controllers/order.controller");
const protectRoute = require("../middlewares/auth");

router.post("/", protectRoute, createOrder);
router.get("/my", protectRoute, getMyOrders);
router.get("/admin/", protectRoute, adminRoute, getAllOrders);


module.exports = router;
