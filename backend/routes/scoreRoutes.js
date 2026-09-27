import express from "express";
import * as scoreController from "../controllers/ScoreController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// CRUD for scores - only judges/organizers/admins
router.post("/", authenticate, requireAuth, scoreController.create);
// getFiltered (not a plain getAll): it scopes the result set to what the
// caller is allowed to see. A judge only ever gets their own ballots.
router.get("/", authenticate, requireAuth, scoreController.getFiltered);
router.get("/:id", authenticate, requireAuth, scoreController.getById);
router.put("/:id", authenticate, requireAuth, scoreController.update);
router.delete("/:id", authenticate, requireAuth, scoreController.deleteById);

export default router;
