import mongoose from "mongoose";

/**
 * One person's community vote on one submitted project.
 *
 * Deliberately in its own collection, nowhere near Score. Ballots decide the
 * official standings; votes are the crowd's applause beside them. Keeping the
 * two apart means a rigged poll can embarrass nobody but itself -- there is no
 * code path by which vote counts reach the judged ranking.
 *
 * The unique index is the one-vote-per-person rule. It holds at the database,
 * not in a check the request path could race past: two simultaneous votes from
 * the same account collide on the index and one of them loses.
 */
const voteSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    // Denormalised so an event's poll can be read without joining projects.
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

voteSchema.index({ projectId: 1, userId: 1 }, { unique: true });
// The event poll: count votes per project across one event.
voteSchema.index({ eventId: 1, projectId: 1 });

export default mongoose.model("Vote", voteSchema);
