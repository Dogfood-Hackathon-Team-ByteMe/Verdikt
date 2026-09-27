import express from "express";
import * as trackController from "../controllers/TrackController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Anyone can view tracks
router.get("/", trackController.getAll);
router.get("/:id", trackController.getById);

// Only organizers/admins can create/update/delete tracks
router.post("/", authenticate, requireAuth, trackController.create);
router.put("/:id", authenticate, requireAuth, trackController.update);
router.delete("/:id", authenticate, requireAuth, trackController.deleteById);

export default router;
