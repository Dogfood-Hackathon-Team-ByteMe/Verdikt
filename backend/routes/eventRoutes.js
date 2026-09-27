import express from "express";
import * as eventController from "../controllers/EventController.js";
import * as userController from "../controllers/UserController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Anyone can view events
router.get("/", eventController.getAll);
router.get("/search", eventController.search);
// Must be declared before "/:id", otherwise Express matches "featured" as an
// event id and the handler 404s on a CastError.
router.get("/featured", eventController.getFeatured);
router.get("/:id", eventController.getById);

// Participants of a specific event — access controlled in service layer
// (must be participant, judge, organiser of that event, or admin)
router.get("/:id/participants", authenticate, requireAuth, userController.getEventParticipants);

// Only organizers/admins can create/update/delete events (further checked in service)
router.post("/", authenticate, requireAuth, eventController.create);
router.put("/:id", authenticate, requireAuth, eventController.update);
router.delete("/:id", authenticate, requireAuth, eventController.deleteById);

export default router;
