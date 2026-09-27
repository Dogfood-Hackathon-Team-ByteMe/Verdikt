import express from "express";
import * as inviteController from "../controllers/InviteController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// View invite details by token (public - so users can see team name before joining)
router.get("/token/:token", inviteController.getByToken);

// Accept an invite (must be authenticated)
router.post(
	"/token/:token/accept",
	authenticate,
	requireAuth,
	inviteController.accept,
);

// CRUD (authenticated)
router.post("/", authenticate, requireAuth, inviteController.create);
router.post("/direct", authenticate, requireAuth, inviteController.sendDirectInvite);
router.get("/", authenticate, requireAuth, inviteController.getAll);
router.get("/:id", authenticate, requireAuth, inviteController.getById);
router.delete("/:id", authenticate, requireAuth, inviteController.deleteById);

export default router;
