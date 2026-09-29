import express from "express";
import * as eventController from "../controllers/EventController.js";
import * as userController from "../controllers/UserController.js";
import * as standingsController from "../controllers/StandingsController.js";
import * as assignmentController from "../controllers/AssignmentController.js";
import * as auditController from "../controllers/AuditController.js";
import * as voteController from "../controllers/VoteController.js";
import * as webhookController from "../controllers/WebhookController.js";
import * as certificateController from "../controllers/CertificateController.js";
import * as portabilityController from "../controllers/PortabilityController.js";
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

// The community poll: submitted projects ranked by votes. Public, because it
// orders projects the public gallery already shows by a number the cards
// already carry -- and it never touches the judged standings.
router.get("/:id/community", voteController.communityStandings);

// Who changed the panel, and when. Organiser of this event or admin: it names
// every judge on the panel and the order they were appointed in.
router.get("/:id/audit", authenticate, requireAuth, auditController.listForEvent);

// Exports for the other stages of the event, organiser only.
router.get("/:id/entries.csv", authenticate, requireAuth, standingsController.getEntriesCsv);
router.get("/:id/assignments.csv", authenticate, requireAuth, standingsController.getAssignmentsCsv);

// Batch assignment of entries to judges. "auto" deals (or tops up) the whole
// event; the plain POST adds one by hand; DELETE clears the lot.
router.get("/:id/assignments", authenticate, requireAuth, assignmentController.list);
router.post("/:id/assignments/auto", authenticate, requireAuth, assignmentController.autoAssign);
router.post("/:id/assignments", authenticate, requireAuth, assignmentController.add);
router.delete("/:id/assignments", authenticate, requireAuth, assignmentController.clear);

// Webhooks on this event (T4). Organiser or admin only, checked in the
// service; the rows carry each subscription's signing secret, which is the
// organiser's own to see.
router.get("/:id/webhooks", authenticate, requireAuth, webhookController.listForEvent);
router.post("/:id/webhooks", authenticate, requireAuth, webhookController.create);

// Certificates (T4). Issuing and the event-wide list are organiser-only;
// each recipient reads their own at /api/certificates/mine, and anyone at
// all verifies one at /api/v1/certificates/:serial.
router.get("/:id/certificates", authenticate, requireAuth, certificateController.listForEvent);
router.post("/:id/certificates", authenticate, requireAuth, certificateController.issue);

// Bulk portability (T4): the organiser leaves with one JSON file, and anyone
// signed in can rebuild an event from one, becoming its organiser here.
// "import" must be declared before "/:id"-shaped POSTs would ever match it.
router.get("/:id/export", authenticate, requireAuth, portabilityController.exportEvent);
router.post("/import", authenticate, requireAuth, portabilityController.importEvent);

// Only organizers/admins can create/update/delete events (further checked in service)
router.post("/", authenticate, requireAuth, eventController.create);
router.put("/:id", authenticate, requireAuth, eventController.update);
router.delete("/:id", authenticate, requireAuth, eventController.deleteById);

export default router;
