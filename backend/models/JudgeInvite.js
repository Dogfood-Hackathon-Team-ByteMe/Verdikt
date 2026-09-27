import mongoose from "mongoose";

/**
 * An invitation to judge one track, for someone who may not have an account yet.
 *
 * Deliberately stricter than a team invite. A team link is meant to be passed
 * around a team; a judge link hands out the right to score other people's work,
 * so it is:
 *
 *   - bound to one email address: only the account with that address can
 *     accept it, so a forwarded or leaked link is useless to anyone else
 *   - single use: accepting it marks it spent
 *   - short-lived and revocable by the organiser
 *
 * The token itself is the secret, so it is never listed back to anyone but the
 * organiser who made it.
 */
const judgeInviteSchema = new mongoose.Schema(
	{
		eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
		trackId: { type: mongoose.Schema.Types.ObjectId, ref: "Track", required: true },
		email: { type: String, required: true, lowercase: true, trim: true },
		token: { type: String, required: true, unique: true },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
		expiresAt: { type: Date, required: true },
		acceptedAt: { type: Date, default: null },
		acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
		revokedAt: { type: Date, default: null },
	},
	{ timestamps: true },
);

judgeInviteSchema.index({ trackId: 1, createdAt: -1 });

export default mongoose.model("JudgeInvite", judgeInviteSchema);
