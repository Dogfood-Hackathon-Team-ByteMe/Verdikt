import express from "express";
import * as eventController from "../controllers/EventController.js";
import * as userController from "../controllers/UserController.js";
import * as standingsController from "../controllers/StandingsController.js";
import * as assignmentController from "../controllers/AssignmentController.js";
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

// The live leaderboard, computed from ballots on every read. Organiser of this
// event or admin only -- standings are built from individual ballots, so anyone
// who can read them can infer what each judge scored.
router.get("/:id/standings", authenticate, requireAuth, standingsController.getForEvent);
router.get("/:id/standings.csv", authenticate, requireAuth, standingsController.getCsvForEvent);

// Exports for the other stages of the event, organiser only.
router.get("/:id/entries.csv", authenticate, requireAuth, standingsController.getEntriesCsv);
router.get("/:id/assignments.csv", authenticate, requireAuth, standingsController.getAssignmentsCsv);

// Batch assignment of entries to judges. "auto" deals (or tops up) the whole
// event; the plain POST adds one by hand; DELETE clears the lot.
router.get("/:id/assignments", authenticate, requireAuth, assignmentController.list);
router.post("/:id/assignments/auto", authenticate, requireAuth, assignmentController.autoAssign);
router.post("/:id/assignments", authenticate, requireAuth, assignmentController.add);
router.delete("/:id/assignments", authenticate, requireAuth, assignmentController.clear);

// Only organizers/admins can create/update/delete events (further checked in service)
router.post("/", authenticate, requireAuth, eventController.create);
router.put("/:id", authenticate, requireAuth, eventController.update);
router.delete("/:id", authenticate, requireAuth, eventController.deleteById);

export default router;
