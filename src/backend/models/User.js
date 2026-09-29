import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			unique: true,
		},

		password: {
			type: String,
			required: true,
		},

		name: {
			type: String,
		},

		participatingIn: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Event",
			},
		],

		judgeIn: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Track",
			},
		],

		organiserIn: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "Event",
			},
		],

		// `/api/images/<id>` for an uploaded picture. A plain string, so an
		// external URL also works for anyone who would rather host elsewhere.
		avatarUrl: {
			type: String,
			trim: true,
			default: "",
		},

		isAdmin: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true },
);

export default mongoose.model("User", userSchema);
