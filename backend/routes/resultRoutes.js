import express from "express";
import * as resultController from "../controllers/ResultController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public viewing of results
router.get("/", resultController.getAll);
router.get("/:id", resultController.getById);

// Only organizers/admins can create/update/delete results
router.post("/", authenticate, requireAuth, resultController.create);
router.put("/:id", authenticate, requireAuth, resultController.update);
router.delete("/:id", authenticate, requireAuth, resultController.deleteById);

export default router;
