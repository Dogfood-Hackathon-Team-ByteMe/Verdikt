import mongoose from "mongoose";

const scoreSchema = new mongoose.Schema(
	{
		judgeId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
		projectId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Project",
			required: true,
		},
		scores: { type: Map, of: Number }, // criteria name -> score value
		comment: { type: String, default: "" },
	},
	{ timestamps: true },
);

// Unique constraint: one judge can only score a project once
scoreSchema.index({ judgeId: 1, projectId: 1 }, { unique: true });

export default mongoose.model("Score", scoreSchema);
