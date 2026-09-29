import express from "express";
import * as publicApi from "../controllers/PublicApiController.js";
import * as certificateController from "../controllers/CertificateController.js";
import { openapiSpec } from "../utils/openapi.js";

/**
 * /api/v1 -- the public read surface. GET only; the router simply has no
 * other verbs, so a POST here 404s before any handler could exist to make a
 * mistake. Mounted in app.js behind the per-address public limiter.
 */
const router = express.Router();

router.get("/", publicApi.index);
router.get("/events", publicApi.listEvents);
router.get("/events/:id", publicApi.getEvent);
router.get("/events/:id/projects", publicApi.listEventProjects);
router.get("/events/:id/community", publicApi.community);
// T4: the gallery as a self-contained HTML page, made to be iframed.
router.get("/events/:id/embed", publicApi.embedGallery);
router.get("/projects/:id", publicApi.getProject);
router.get("/projects/:id/comments", publicApi.projectComments);

// T4: verify a certificate by its serial, and the key to verify offline with.
// Keyless on purpose -- "publicly verifiable" means without an account here.
router.get("/certificates/:serial", certificateController.verify);
router.get("/keys/current", certificateController.publicKey);

// T4 "API first": the machine-readable description of the whole surface.
router.get("/openapi.json", (req, res) => res.json(openapiSpec));

export default router;
