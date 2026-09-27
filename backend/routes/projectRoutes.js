import express from "express";
import * as projectController from "../controllers/ProjectController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// PUBLIC (T1: the gallery is public).
//
// `authenticate` without `requireAuth` on purpose: an anonymous visitor gets
// through with req.user = null and sees submitted projects, while a signed-in
// team member is recognised and additionally sees their own drafts.
router.get("/", authenticate, projectController.getAll);
router.get("/search", authenticate, projectController.search);
router.get("/:id", authenticate, projectController.getById);

// Authenticated: only a team's own members can write its project.
router.post("/", authenticate, requireAuth, projectController.create);
router.put("/:id", authenticate, requireAuth, projectController.update);
router.delete("/:id", authenticate, requireAuth, projectController.deleteById);

// Draft lifecycle. Separate from PUT so the deadline and the organizer's
// required custom questions are enforced at the moment of submission.
router.post("/:id/submit", authenticate, requireAuth, projectController.submit);
router.post("/:id/unsubmit", authenticate, requireAuth, projectController.unsubmit);

export default router;
