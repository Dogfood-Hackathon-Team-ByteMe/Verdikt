import mongoose from "mongoose";

/**
 * One organizer-registered webhook endpoint on one event.
 *
 * The secret is minted by the server, never chosen by the caller, and every
 * delivery is signed with it (HMAC-SHA256 over the exact body). The receiver
 * proves a payload came from this Verdikt and not from anyone who guessed the
 * URL by recomputing the signature -- which matters, because a webhook receiver
 * is by definition an unauthenticated endpoint.
 */
const webhookSchema = new mongoose.Schema(
	{
		eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
		url: { type: String, required: true, trim: true },
		// The delivery types this endpoint wants. Empty means all of them.
		events: [{ type: String }],
		secret: { type: String, required: true },
		active: { type: Boolean, default: true },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ timestamps: true },
);

webhookSchema.index({ eventId: 1 });

export default mongoose.model("Webhook", webhookSchema);
