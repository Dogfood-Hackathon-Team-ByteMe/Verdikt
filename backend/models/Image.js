import mongoose from "mongoose";

/**
 * An uploaded image, stored as bytes in MongoDB.
 *
 * Why in the database rather than on disk or in object storage:
 *
 *   - S3/Cloudinary would need a cloud account and API keys, and the whole
 *     premise here is "one command, no external service, works with the
 *     network cable pulled".
 *   - A mounted volume works offline, but it splits the backup story. Today
 *     `mongodump` is the entire backup (see DATA-MODEL.md); adding a second
 *     stateful location means a restore can silently come back with every
 *     record intact and every picture missing.
 *
 * So the bytes live beside everything else. The cap is 2 MB, comfortably under
 * MongoDB's 16 MB document ceiling, which is why this does not need GridFS --
 * GridFS exists to chunk files past that limit, and paying its complexity for
 * avatars and banners would be the wrong trade.
 *
 * The bytes are never embedded in another document's response: callers store
 * the URL `/api/images/<id>` and the browser fetches it separately, so a list
 * of projects stays a list of projects.
 */
const imageSchema = new mongoose.Schema(
	{
		data: {
			type: Buffer,
			required: true,
		},

		contentType: {
			type: String,
			required: true,
			enum: ["image/png", "image/jpeg", "image/webp", "image/gif"],
		},

		size: {
			type: Number,
			required: true,
		},

		// Who uploaded it, so an orphaned image can be traced or swept later.
		uploadedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},

		createdAt: {
			type: Date,
			default: Date.now,
		},
	},
	// Content is immutable: replacing a picture creates a new document and a
	// new URL, which is what makes the cache headers on GET safe to set to a
	// year.
	{ minimize: false },
);

export default mongoose.model("Image", imageSchema);
