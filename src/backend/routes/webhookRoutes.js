import express from "express";
import * as webhookController from "../controllers/WebhookController.js";
import { authenticate, requireAuth } from "../middlewares/authMiddleware.js";

/**
 * /api/webhooks -- managing one subscription by id. Creation and listing hang
 * off the event that owns them (/api/events/:id/webhooks), the same shape as
 * assignments and the audit trail. Everything here is organiser-of-the-event
 * or admin, checked in the service.
 */
const router = express.Router();

router.delete("/:id", authenticate, requireAuth, webhookController.remove);
router.get("/:id/deliveries", authenticate, requireAuth, webhookController.deliveries);
router.post("/:id/deliveries/:deliveryId/redeliver", authenticate, requireAuth, webhookController.redeliver);

export default router;
