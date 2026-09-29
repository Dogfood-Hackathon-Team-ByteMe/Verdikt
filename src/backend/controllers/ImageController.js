import * as imageService from "../services/ImageService.js";

export const upload = async (req, res, next) => {
	try {
		// express.raw() leaves a Buffer on req.body for the types it is mounted
		// for; anything else arrives as an empty object.
		const buffer = Buffer.isBuffer(req.body) ? req.body : null;
		const contentType = (req.headers["content-type"] || "").split(";")[0].trim();

		const result = await imageService.createImage(buffer, contentType, req.user._id);
		res.status(201).json({ success: true, data: result, message: "Image uploaded successfully" });
	} catch (error) {
		next(error);
	}
};

export const serve = async (req, res, next) => {
	try {
		const image = await imageService.getImage(req.params.id);

		// Content at a given id never changes -- replacing a picture mints a new
		// id -- so this is safe to cache hard, and the ETag turns a revisit into
		// a 304 instead of 2 MB down the wire.
		res.set("Content-Type", image.contentType);
		res.set("Cache-Control", "public, max-age=31536000, immutable");
		res.set("ETag", `"${image._id}"`);

		if (req.headers["if-none-match"] === `"${image._id}"`) {
			return res.status(304).end();
		}

		res.send(image.data);
	} catch (error) {
		next(error);
	}
};
