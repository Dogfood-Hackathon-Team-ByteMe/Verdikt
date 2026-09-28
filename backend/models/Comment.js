import mongoose from "mongoose";

/**
 * A public comment on a submitted project.
 *
 * Threading is one level deep: a comment either stands alone or replies to a
 * top-level comment. Deeper nesting buys nothing on a project page and makes
 * moderation reasoning recursive.
 *
 * Removal never deletes the row. `removedAt`/`removedBy` blank the body at
 * read time while the row keeps its place, so a thread does not silently
 * reflow -- replies keep the parent they answered, and a dispute can still
 * establish that a comment existed and who took it down.
 */
const commentSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    // Denormalised so an organiser's moderation queue is one query.
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, maxlength: 2000 },
    // Set only on replies, and only ever to a top-level comment.
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },

    removedAt: { type: Date, default: null },
    // "author" or "organiser": decides what the placeholder says.
    removedBy: { type: String, enum: ["author", "organiser", null], default: null },
  },
  { timestamps: true },
);

commentSchema.index({ projectId: 1, createdAt: 1 });

export default mongoose.model("Comment", commentSchema);
