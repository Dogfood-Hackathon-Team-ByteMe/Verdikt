import express from "express";
import * as imageController from "../controllers/ImageController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";
import { ALLOWED_TYPES, MAX_BYTES } from "../services/ImageService.js";

const router = express.Router();

/**
 * Upload. The body is the raw file, not multipart -- a browser can send a File
 * object straight through fetch(), and it saves taking on a multipart parser
 * for a project that otherwise has five dependencies.
 *
 * express.json() upstream only claims application/json, so an image body
 * reaches this untouched.
 */
router.post(
	"/",
	authenticate,
	requireAuth,
	express.raw({ type: ALLOWED_TYPES, limit: MAX_BYTES }),
	imageController.upload,
);

// Public: images appear in the public gallery, which needs no account.
router.get("/:id", imageController.serve);

export default router;
