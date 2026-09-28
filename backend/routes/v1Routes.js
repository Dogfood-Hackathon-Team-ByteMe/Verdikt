import express from "express";
import * as publicApi from "../controllers/PublicApiController.js";

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
router.get("/projects/:id", publicApi.getProject);
router.get("/projects/:id/comments", publicApi.projectComments);

export default router;
