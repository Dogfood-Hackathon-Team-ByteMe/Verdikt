import express from "express";
import * as certificateController from "../controllers/CertificateController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

/**
 * /api/certificates -- a signed-in person's own certificates. Issuing lives on
 * the event (/api/events/:id/certificates), public verification on /api/v1.
 */
const router = express.Router();

router.get("/mine", authenticate, requireAuth, certificateController.mine);

export default router;
