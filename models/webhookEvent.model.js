import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true
  },

  eventType: String,

  receivedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("WebhookEvent", webhookEventSchema);
