import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		type: {
			type: String,
			enum: [
				"join_request",
				"direct_invite",
				"request_accepted",
				"request_rejected",
				"system",
			],
			required: true,
		},
		message: {
			type: String,
			required: true,
		},
		isRead: {
			type: Boolean,
			default: false,
		},
		referenceId: {
			type: mongoose.Schema.Types.ObjectId,
		},
		referenceToken: {
			type: String,
		},
	},
	{ timestamps: true },
);

export default mongoose.model("Notification", notificationSchema);
