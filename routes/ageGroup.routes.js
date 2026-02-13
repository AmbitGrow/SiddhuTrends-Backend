import express from "express";
import { getActiveAgeGroups } from "../controllers/ageGroup.controller.js";

const router = express.Router();

router.get("/", getActiveAgeGroups);

export default router;
