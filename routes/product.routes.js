import express from "express";
import {
  listProducts,
  getProductById,
} from "../controllers/product.controller.js";

const router = express.Router();

router.get("/", listProducts);

router.get(
  "/category/:categoryId",
  (req, res, next) => {
    req.query.categoryId = req.params.categoryId;
    next();
  },
  listProducts,
);

router.get(
  "/age/:ageGroupId",
  (req, res, next) => {
    req.query.ageGroupId = req.params.ageGroupId;
    next();
  },
  listProducts,
);

router.get("/:id", getProductById);

export default router;
