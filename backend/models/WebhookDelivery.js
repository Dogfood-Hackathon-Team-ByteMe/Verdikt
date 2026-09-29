import mongoose from "mongoose";

/**
 * One attempt-history row per payload sent to one webhook.
 *
 * Kept so the organizer can see what fired, what landed and what did not --
 * a webhook that fails silently is worse than no webhook, because the
 * receiver's owner believes they are covered. Failed rows can be redelivered
 * by hand from the dashboard.
 */
const webhookDeliverySchema = new mongoose.Schema(
	{
		webhookId: { type: mongoose.Schema.Types.ObjectId, ref: "Webhook", required: true },
		// Denormalised so an event's whole delivery log reads without a join.
		eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
		type: { type: String, required: true },
		// The exact JSON string that was signed and sent. Stored as the string,
		// not the object, so a redelivery signs byte-for-byte the same body.
		body: { type: String, required: true },
		status: { type: String, enum: ["pending", "delivered", "failed"], default: "pending" },
		attempts: { type: Number, default: 0 },
		responseStatus: { type: Number, default: null },
		error: { type: String, default: null },
		deliveredAt: { type: Date, default: null },
	},
	{ timestamps: true },
);

webhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
webhookDeliverySchema.index({ eventId: 1, createdAt: -1 });

export default mongoose.model("WebhookDelivery", webhookDeliverySchema);
