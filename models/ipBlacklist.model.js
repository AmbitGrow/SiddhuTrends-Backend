import mongoose from "mongoose";

const ipBlacklistSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true
    },
    blockedUntil: {
      type: Date,
      required: true
    },
    reason: {
      type: String
    }
  },
  { timestamps: true }
);

const IPBlacklist = mongoose.model("IPBlacklist", ipBlacklistSchema);

export default IPBlacklist;
