import express from "express";
import * as ctrl from "../controllers/AssignmentController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Event-scoped create/list/clear live under /api/events/:id/assignments; this
// is only the by-id removal.
router.delete("/:id", authenticate, requireAuth, ctrl.remove);

export default router;
