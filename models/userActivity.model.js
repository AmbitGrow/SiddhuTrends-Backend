import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    userAgent: {
      type: String
    },
    action: {
      type: String,
      enum: ["LOGIN_SUCCESS", "LOGIN_FAILED", "REGISTER"],
      required: true
    }
  },
  { timestamps: true }
);

const UserActivity = mongoose.model("UserActivity", userActivitySchema);

export default UserActivity;
