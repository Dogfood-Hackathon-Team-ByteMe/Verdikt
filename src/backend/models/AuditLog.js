import mongoose from "mongoose";

/**
 * An append-only record of actions that change who can do what.
 *
 * Judging is only trustworthy if a disputed result can be reconstructed. Until
 * now a panel could change under an organiser -- a judge appointed, an
 * application accepted, a batch re-dealt -- and nothing said who did it or
 * when. The standings are computed from ballots on every read, so the ballots
 * explain the numbers; this explains the panel that produced them.
 *
 * There is no update or delete path, by design. A log you can edit answers no
 * question that a dispute actually asks.
 */
const auditLogSchema = new mongoose.Schema(
  {
    /** Who did it. Null for an action nobody was signed in for, such as a failed sign-in. */
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    /** A dotted name, e.g. "judge.appointed". Read the constants in AuditService. */
    action: { type: String, required: true },

    /**
     * The event this belongs to, when there is one. It decides who may read the
     * row: an organiser reads their own event's trail, and only an admin reads
     * rows that belong to no event (sign-ins, account creation).
     */
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },

    /** What was acted on, loosely typed because it spans collections. */
    targetType: { type: String, default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },

    /** Where it came from. Only as trustworthy as the proxy config in app.js. */
    ip: { type: String, default: null },

    /** Anything worth keeping that is not worth a column, e.g. an email or a count. */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The two reads this supports: one event's trail, newest first, and the
// admin-wide trail.
auditLogSchema.index({ eventId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
