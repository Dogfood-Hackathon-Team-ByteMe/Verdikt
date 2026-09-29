import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
	token: {
		type: String,
		required: true,
		unique: true,
		index: true,
	},

	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},

	role: {
		type: String,
		enum: ["visitor", "participant", "judge", "organizer", "admin"],
		required: true,
	},

	createdAt: {
		type: Date,
		default: Date.now,
		expires: 86400,
	}, // 24hr TTL
});

export default mongoose.model("Session", sessionSchema);
