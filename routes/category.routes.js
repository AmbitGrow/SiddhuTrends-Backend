import express from "express";
import {

  getActiveCategories
} from "../controllers/category.controller.js";


const router = express.Router();

router.get("/", getActiveCategories);

export default router;
