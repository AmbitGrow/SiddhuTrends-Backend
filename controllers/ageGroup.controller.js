import AgeGroup from "../models/ageGroup.model.js";

// CREATE AGE GROUP (ADMIN)
export const createAgeGroup = async (req, res) => {
  try {
    const { label, minAge, maxAge, unit } = req.body;

    if (!label || minAge == null || maxAge == null || !unit) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (minAge < 0 || maxAge < minAge) {
      return res.status(400).json({ message: "Invalid age range" });
    }

    const existing = await AgeGroup.findOne({ label });
    if (existing) {
      return res.status(400).json({ message: "Age group already exists" });
    }

    const ageGroup = await AgeGroup.create({
      label,
      minAge,
      maxAge,
      unit
    });

    res.status(201).json({
      message: "Age group created",
      ageGroup
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create age group" });
  }
};

// GET ALL AGE GROUPS (ADMIN)
export const getAllAgeGroupsAdmin = async (req, res) => {
  try {
    const ageGroups = await AgeGroup.find().sort({ minAge: 1 });
    res.json(ageGroups);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch age groups" });
  }
};

// UPDATE AGE GROUP (ADMIN)
export const updateAgeGroup = async (req, res) => {
  try {
    const { ageGroupId } = req.params;
    const updates = req.body;

    const ageGroup = await AgeGroup.findById(ageGroupId);
    if (!ageGroup) {
      return res.status(404).json({ message: "Age group not found" });
    }

    if (
      updates.minAge != null &&
      updates.maxAge != null &&
      updates.maxAge < updates.minAge
    ) {
      return res.status(400).json({ message: "Invalid age range" });
    }

    Object.assign(ageGroup, updates);
    await ageGroup.save();

    res.json({
      message: "Age group updated",
      ageGroup
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update age group" });
  }
};

// TOGGLE AGE GROUP STATUS (ADMIN)
export const toggleAgeGroupStatus = async (req, res) => {
  try {
    const { ageGroupId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const ageGroup = await AgeGroup.findById(ageGroupId);
    if (!ageGroup) {
      return res.status(404).json({ message: "Age group not found" });
    }

    ageGroup.isActive = isActive;
    await ageGroup.save();

    res.json({
      message: `Age group ${isActive ? "enabled" : "disabled"}`
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update age group status" });
  }
};

// GET ACTIVE AGE GROUPS (PUBLIC)
export const getActiveAgeGroups = async (req, res) => {
  try {
    const ageGroups = await AgeGroup.find({ isActive: true }).sort({ minAge: 1 });
    res.json(ageGroups);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch age groups" });
  }
};
