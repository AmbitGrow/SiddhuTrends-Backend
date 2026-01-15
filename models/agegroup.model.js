import mongoose from "mongoose";

const ageGroupSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      unique: true
    },
    minAge: {
      type: Number,
      required: true,
      min: 0
    },
    maxAge: {
      type: Number,
      required: true
    },
    unit: {
      type: String,
      enum: ["months", "years"],
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

const AgeGroup = mongoose.model("AgeGroup", ageGroupSchema);
export default AgeGroup;
