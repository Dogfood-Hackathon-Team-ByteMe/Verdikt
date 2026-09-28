import express from "express";
import * as authController from "../controllers/AuthController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";
import { loginLimiter, registerLimiter } from "../middlewares/rateLimit.js";

const router = express.Router();

// Public: you cannot already be signed in when you sign up or sign in.
// (POST /api/users is deliberately NOT the registration route -- it is the
// admin-only path for creating accounts on someone else's behalf.)
router.post("/register", registerLimiter, authController.register);
router.post("/login", loginLimiter, authController.login);

// logout only needs `authenticate`, not `requireAuth`: signing out when you
// are already signed out should quietly succeed rather than 401.
router.post("/logout", authenticate, authController.logout);

router.get("/me", authenticate, requireAuth, authController.me);

export default router;
