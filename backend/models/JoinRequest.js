import mongoose from "mongoose";

const joinRequestSchema = new mongoose.Schema(
	{
		teamId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Team",
			required: true,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		status: {
			type: String,
			enum: ["pending", "accepted", "rejected"],
			default: "pending",
		},
	},
	{ timestamps: true },
);

joinRequestSchema.index({ teamId: 1, userId: 1, status: 1 });

export default mongoose.model("JoinRequest", joinRequestSchema);
