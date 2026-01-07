import express from "express";
import {
  listProducts,
  getProductById
} from "../controllers/product.controller.js";

const router = express.Router();

// USER — PUBLIC PRODUCT LIST
router.get("/products", listProducts);

// Filter by category
router.get("/products/category/:categoryId", (req, res, next) => {
  req.query.categoryId = req.params.categoryId;
  next();
}, listProducts);

// Filter by age group
router.get("/products/age/:ageGroupId", (req, res, next) => {
  req.query.ageGroupId = req.params.ageGroupId;
  next();
}, listProducts);

// Product detail
router.get("/products/:id", getProductById);

export default router;
