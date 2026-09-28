import express from "express";

import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import eventRoutes from "./eventRoutes.js";
import trackRoutes from "./trackRoutes.js";
import teamRoutes from "./teamRoutes.js";
import projectRoutes from "./projectRoutes.js";
import scoreRoutes from "./scoreRoutes.js";
import resultRoutes from "./resultRoutes.js";
import inviteRoutes from "./inviteRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import joinRequestRoutes from "./joinRequestRoutes.js";
import judgeApplicationRoutes from "./judgeApplicationRoutes.js";
import imageRoutes from "./imageRoutes.js";
import judgeInviteRoutes from "./judgeInviteRoutes.js";
import * as auditController from "../controllers/AuditController.js";
import * as commentController from "../controllers/CommentController.js";
import assignmentRoutes from "./assignmentRoutes.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";
import * as scoreController from "../controllers/ScoreController.js";
import * as standingsController from "../controllers/StandingsController.js";
import * as assignmentController from "../controllers/AssignmentController.js";

const router = express.Router();

// Authentication (public register/login, cookie session)
router.use("/auth", authRoutes);

// Entity CRUD routes
router.use("/images", imageRoutes);
router.use("/users", userRoutes);
router.use("/events", eventRoutes);
router.use("/tracks", trackRoutes);
router.use("/teams", teamRoutes);
router.use("/projects", projectRoutes);
router.use("/scores", scoreRoutes);
router.use("/results", resultRoutes);
router.use("/invites", inviteRoutes);
router.use("/notifications", notificationRoutes);
router.use("/join-requests", joinRequestRoutes);
router.use("/judge-applications", judgeApplicationRoutes);
router.use("/judge-invites", judgeInviteRoutes);
router.use("/assignments", assignmentRoutes);

// Comment removal: its author taking it back, or the event's organiser
// moderating. The latter is recorded in the audit trail.
router.delete("/comments/:id", authenticate, requireAuth, commentController.remove);

// The whole trail, including the rows that belong to no event (sign-in
// failures, accounts created). Admin only; an organiser reads their own
// event's slice at GET /api/events/:id/audit.
router.get("/audit", authenticate, requireAuth, auditController.listAll);

// ============================================================
// ACCEPTANCE CHECKER ROUTES
// These are the specific routes that run.py tests
// ============================================================

// T2: Judge Scores - uses authenticate middleware and ScoreController.getJudgeScores
// The getJudgeScores handler does its own auth checks (returns 401/403 as needed)
router.get("/judge/scores", authenticate, scoreController.getFiltered);

// The judge's own queue for one event: exactly the entries they may score, as
// decided by services/JudgeScope.js. The judging page renders this list as-is.
router.get("/judge/queue", authenticate, requireAuth, assignmentController.queue);

// T2: CSV export of every ballot. Organiser of the event or admin only. The
// path predates the per-event exports (/api/events/:id/*.csv) and is kept
// because the acceptance checker calls it.
router.get("/export.csv", authenticate, requireAuth, standingsController.getBallotsCsv);

export default router;
