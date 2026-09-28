import express from "express";
import * as projectController from "../controllers/ProjectController.js";
import * as voteController from "../controllers/VoteController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";
import { commentLimiter } from "../middlewares/rateLimit.js";
import * as commentController from "../controllers/CommentController.js";

const router = express.Router();

// PUBLIC (T1: the gallery is public).
//
// `authenticate` without `requireAuth` on purpose: an anonymous visitor gets
// through with req.user = null and sees submitted projects, while a signed-in
// team member is recognised and additionally sees their own drafts.
router.get("/", authenticate, projectController.getAll);
router.get("/search", authenticate, projectController.search);
router.get("/:id", authenticate, projectController.getById);

// Comments. Reading is public, like the gallery itself; posting needs an
// account and has its own rate ceiling. Removal lives at /api/comments/:id.
router.get("/:id/comments", commentController.list);
router.post("/:id/comments", authenticate, requireAuth, commentLimiter, commentController.add);

// Community voting. Signed-in, one vote per person per project; the service
// refuses your own team, the event's judges, its organiser and admins.
router.post("/:id/vote", authenticate, requireAuth, voteController.cast);
router.delete("/:id/vote", authenticate, requireAuth, voteController.withdraw);

// Authenticated: only a team's own members can write its project.
router.post("/", authenticate, requireAuth, projectController.create);
router.put("/:id", authenticate, requireAuth, projectController.update);
router.delete("/:id", authenticate, requireAuth, projectController.deleteById);

// Draft lifecycle. Separate from PUT so the deadline and the organizer's
// required custom questions are enforced at the moment of submission.
router.post("/:id/submit", authenticate, requireAuth, projectController.submit);
router.post("/:id/unsubmit", authenticate, requireAuth, projectController.unsubmit);

export default router;
