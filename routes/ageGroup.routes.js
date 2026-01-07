import express from "express";
import {
  createAgeGroup,
  getAllAgeGroupsAdmin,
  updateAgeGroup,
  toggleAgeGroupStatus,
  getActiveAgeGroups
} from "../controllers/ageGroup.controller.js";

import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// ADMIN
router.post("/admin/age-groups", protectRoute, adminRoute, createAgeGroup);
router.get("/admin/age-groups", protectRoute, adminRoute, getAllAgeGroupsAdmin);
router.put(
  "/admin/age-groups/:ageGroupId",
  protectRoute,
  adminRoute,
  updateAgeGroup
);
router.patch(
  "/admin/age-groups/:ageGroupId/status",
  protectRoute,
  adminRoute,
  toggleAgeGroupStatus
);

// PUBLIC
router.get("/age-groups", getActiveAgeGroups);

export default router;
