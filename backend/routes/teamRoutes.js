import express from "express";
import * as teamController from "../controllers/TeamController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Anyone can view teams
router.get("/", teamController.getAll);
router.get("/search", authenticate, requireAuth, teamController.search);
router.get("/:id", teamController.getById);

// Only authenticated participants can create/update/delete teams
router.post("/", authenticate, requireAuth, teamController.create);
router.put("/:id", authenticate, requireAuth, teamController.update);
router.delete("/:id", authenticate, requireAuth, teamController.deleteById);

// Member management
router.post(
	"/:id/members",
	authenticate,
	requireAuth,
	teamController.addMember,
);
router.delete(
	"/:id/members/:userId",
	authenticate,
	requireAuth,
	teamController.removeMember,
);

export default router;
