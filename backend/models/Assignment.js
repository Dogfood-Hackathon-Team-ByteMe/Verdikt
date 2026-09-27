import mongoose from "mongoose";

/**
 * One judge, asked to review one entry.
 *
 * Once an event has any assignments, they ARE the judging scope: a judge can
 * score exactly the entries assigned to them and nothing else (see
 * utils/judgeScope.js). That is what turns "3 independent reviews per project"
 * from a hope into something the server enforces.
 *
 * `source` records how the assignment came about, because the three are
 * treated differently when an organizer re-runs or clears the batch:
 *   auto     dealt by the batch assigner
 *   manual   added by hand by the organizer
 *   ballot   the judge had already scored this entry before assignments
 *            existed, so it was adopted rather than stranding their ballot
 */
const assignmentSchema = new mongoose.Schema(
	{
		eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
		judgeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
		source: { type: String, enum: ["auto", "manual", "ballot"], default: "auto" },
		createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
	},
	{ timestamps: true },
);

// A judge reviews an entry once. Also what makes re-running the assigner safe.
assignmentSchema.index({ judgeId: 1, projectId: 1 }, { unique: true });
assignmentSchema.index({ eventId: 1, judgeId: 1 });
assignmentSchema.index({ eventId: 1, projectId: 1 });

export default mongoose.model("Assignment", assignmentSchema);
