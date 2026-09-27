import Image from "../models/Image.js";

/** What a browser may upload. Anything else is refused outright. */
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** 2 MB. Well under MongoDB's 16 MB document limit -- see models/Image.js. */
export const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Magic-number check.
 *
 * The Content-Type header is supplied by the caller, so on its own it proves
 * nothing: anything can be posted as image/png. Sniffing the first bytes means
 * what gets stored is actually the kind of file it claims to be, which matters
 * because these bytes are served back with that same type.
 */
const SIGNATURES = [
	{ type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
	{ type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
	{ type: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

const sniff = (buffer) => {
	for (const { type, bytes } of SIGNATURES) {
		if (bytes.every((b, i) => buffer[i] === b)) return type;
	}
	// WEBP is "RIFF....WEBP": the tag sits at offset 8, past the file size.
	if (
		buffer.length > 12 &&
		buffer.toString("ascii", 0, 4) === "RIFF" &&
		buffer.toString("ascii", 8, 12) === "WEBP"
	) {
		return "image/webp";
	}
	return null;
};

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const createImage = async (buffer, contentType, uploadedBy) => {
	if (!buffer || !buffer.length) throw badRequest("No image data was sent");
	if (buffer.length > MAX_BYTES) {
		throw badRequest(`Images must be ${Math.round(MAX_BYTES / 1024 / 1024)} MB or smaller`);
	}
	if (!ALLOWED_TYPES.includes(contentType)) {
		throw badRequest(`Unsupported image type. Use ${ALLOWED_TYPES.join(", ")}`);
	}

	const actual = sniff(buffer);
	if (!actual) throw badRequest("That file is not a PNG, JPEG, WEBP or GIF");
	if (actual !== contentType) {
		throw badRequest(`File is a ${actual}, but was sent as ${contentType}`);
	}

	const image = await Image.create({
		data: buffer,
		contentType: actual,
		size: buffer.length,
		uploadedBy,
	});

	// The id is the whole point: callers store `/api/images/<id>`.
	return { id: image._id.toString(), url: `/api/images/${image._id}`, size: image.size, contentType: actual };
};

export const getImage = async (id) => {
	const image = await Image.findById(id);
	if (!image) throw Object.assign(new Error("Image not found"), { statusCode: 404 });
	return image;
};
