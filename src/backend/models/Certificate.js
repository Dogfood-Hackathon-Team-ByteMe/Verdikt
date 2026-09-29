import mongoose from "mongoose";

/**
 * One issued certificate or judge participation record.
 *
 * The `record` field is the exact JSON string that was signed -- stored as the
 * string, never re-serialised, because a signature is over bytes and two
 * JSON.stringify calls are not guaranteed to agree forever. Anyone can verify
 * a certificate with the serial alone, no account needed: the public endpoint
 * hands back record, signature and public key, and the maths does the rest.
 *
 * Names and titles are frozen in at issue time. A certificate says what was
 * true when it was issued; renaming a team later does not rewrite history.
 */
const certificateSchema = new mongoose.Schema(
	{
		serial: { type: String, required: true, unique: true },
		eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
		kind: { type: String, enum: ["participation", "placement", "judge"], required: true },
		recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		// Denormalised for reads; the signed truth lives inside `record`.
		recipientName: { type: String, required: true },
		projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
		record: { type: String, required: true },
		signature: { type: String, required: true },
		issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	},
	{ timestamps: true },
);

// One certificate of a given kind per person per event (per project for
// placement certs). Issuing twice is an idempotent no-op, enforced where a
// race cannot slip past it.
certificateSchema.index(
	{ eventId: 1, kind: 1, recipientUserId: 1, projectId: 1 },
	{ unique: true },
);

export default mongoose.model("Certificate", certificateSchema);
