import mongoose from "mongoose";

const securityEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    type: {
      type: String,
      enum: [
        "LOGIN_FAILED",
        "ACCOUNT_LOCKED",
        "IP_BLOCKED",
        "SUSPICIOUS_ACTIVITY"
      ]
    },
    ipAddress: String,
    description: String
  },
  { timestamps: true }
);

const SecurityEvent = mongoose.model("SecurityEvent", securityEventSchema);

export default SecurityEvent;
