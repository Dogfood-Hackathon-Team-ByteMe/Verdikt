import express from "express";
import * as userController from "../controllers/UserController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", authenticate, requireAuth, userController.create);
router.get("/", authenticate, requireAuth, userController.getAll);
router.get("/:id", authenticate, requireAuth, userController.getById);
router.put("/:id", authenticate, requireAuth, userController.update);
router.delete("/:id", authenticate, requireAuth, userController.deleteById);

export default router;
