import express from "express";
import * as trackController from "../controllers/TrackController.js";
import * as judgeInviteController from "../controllers/JudgeInviteController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Anyone can view tracks. `authenticate` (without requireAuth) is here so the
// handler knows WHO is asking without demanding that anyone be: an organiser of
// the event sees their judges' email addresses, everyone else sees names only.
router.get("/", authenticate, trackController.getAll);
router.get("/:id", authenticate, trackController.getById);

// Only organizers/admins can create/update/delete tracks
router.post("/", authenticate, requireAuth, trackController.create);
router.put("/:id", authenticate, requireAuth, trackController.update);
router.delete("/:id", authenticate, requireAuth, trackController.deleteById);

// Judges on a track. assignJudge also mirrors the appointment onto the event
// and the user, so these are the only two verbs the organizer UI needs.
router.post("/:id/judges", authenticate, requireAuth, trackController.addJudge);
router.delete("/:id/judges/:userId", authenticate, requireAuth, trackController.removeJudge);

// Judge invites: for panel members who do not have an account yet.
router.get("/:id/judge-invites", authenticate, requireAuth, judgeInviteController.listForTrack);
router.post("/:id/judge-invites", authenticate, requireAuth, judgeInviteController.create);

export default router;
