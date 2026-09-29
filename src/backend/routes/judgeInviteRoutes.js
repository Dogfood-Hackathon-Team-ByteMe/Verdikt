import express from "express";
import * as ctrl from "../controllers/JudgeInviteController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public, like a team invite preview: you should be able to see which event
// and track you are being asked to judge before you make an account.
router.get("/token/:token", ctrl.preview);
router.post("/token/:token/accept", authenticate, requireAuth, ctrl.accept);
router.delete("/:id", authenticate, requireAuth, ctrl.revoke);

export default router;
