/**
 * Webhooks (T4): push the event's life out to URLs the organizer registers.
 *
 * Two rules shape everything here:
 *
 *   1. A webhook must never break the action it describes. `dispatch` is
 *      fire-and-forget from the caller's point of view, exactly like the audit
 *      trail: a dead receiver costs the organizer a failed delivery row, not a
 *      participant their submission.
 *   2. The receiver must be able to prove who is calling. Every delivery is
 *      signed -- HMAC-SHA256 with the subscription's server-minted secret over
 *      the exact body -- and carries the type and delivery id in headers, so a
 *      receiver can reject anything unsigned without parsing it.
 *
 * Delivery: one attempt straight away, then up to two retries with backoff.
 * After that the row stays `failed` and the organizer can redeliver it by hand
 * from the dashboard, which signs and sends byte-for-byte the same body.
 */
import crypto from "crypto";
import Webhook from "../models/Webhook.js";
import WebhookDelivery from "../models/WebhookDelivery.js";
import Event from "../models/Event.js";
import * as auditService from "./AuditService.js";
import { ACTIONS } from "./AuditService.js";

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** Delivery types. Named constants so a typo is a crash, not a silent no-fire. */
export const TYPES = {
	PROJECT_SUBMITTED: "project.submitted",
	PROJECT_WITHDRAWN: "project.withdrawn",
	BALLOT_CAST: "ballot.cast",
	JUDGE_APPOINTED: "judge.appointed",
	JUDGE_REMOVED: "judge.removed",
	ASSIGNMENTS_DEALT: "assignments.dealt",
	COMMENT_CREATED: "comment.created",
	VOTE_CAST: "vote.cast",
};

const KNOWN_TYPES = new Set(Object.values(TYPES));

/** Retry backoff (ms) before attempts 2 and 3. Overridable so tests run fast. */
export const RETRY_DELAYS_MS = [
	Number(process.env.WEBHOOK_RETRY_1_MS ?? 2_000),
	Number(process.env.WEBHOOK_RETRY_2_MS ?? 10_000),
];

const TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5_000);

/**
 * Every in-flight delivery chain, so tests (and a clean shutdown) can wait for
 * the dust to settle instead of asserting against a race.
 */
const inFlight = new Set();

export const flushWebhooks = async () => {
	while (inFlight.size > 0) {
		await Promise.allSettled([...inFlight]);
	}
};

const track = (promise) => {
	inFlight.add(promise);
	promise.finally(() => inFlight.delete(promise));
	return promise;
};

const loadEventAsOrganiser = async (eventId, user) => {
	const event = await Event.findById(eventId);
	if (!event) throw fail("Event not found", 404);
	const isOrganiser = user.organiserIn?.some((id) => id.toString() === event._id.toString());
	if (!isOrganiser && !user.isAdmin) {
		throw fail("Only the event organiser can manage webhooks", 403);
	}
	return event;
};

/**
 * Register an endpoint. The secret comes back exactly once here and then on
 * every organizer read -- it is the organizer's own secret, not a stranger's.
 */
export const create = async (eventId, user, { url, events: types } = {}) => {
	await loadEventAsOrganiser(eventId, user);

	let parsed;
	try {
		parsed = new URL(String(url ?? ""));
	} catch {
		throw fail("A valid URL is required", 400);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw fail("Webhook URLs must be http or https", 400);
	}

	const wanted = Array.isArray(types) ? types.filter((t) => KNOWN_TYPES.has(t)) : [];
	if (Array.isArray(types) && types.length > 0 && wanted.length === 0) {
		throw fail(`No such delivery types. Known: ${[...KNOWN_TYPES].join(", ")}`, 400);
	}

	const webhook = await Webhook.create({
		eventId,
		url: parsed.toString(),
		events: wanted,
		secret: crypto.randomBytes(32).toString("hex"),
		createdBy: user._id,
	});

	await auditService.record(null, ACTIONS.WEBHOOK_CREATED, {
		actorId: user._id,
		eventId,
		targetType: "webhook",
		targetId: webhook._id,
		meta: { url: webhook.url },
	});

	return webhook;
};

export const listForEvent = async (eventId, user) => {
	await loadEventAsOrganiser(eventId, user);
	return await Webhook.find({ eventId }).sort({ createdAt: 1 });
};

export const remove = async (webhookId, user) => {
	const webhook = await Webhook.findById(webhookId);
	if (!webhook) throw fail("Webhook not found", 404);
	await loadEventAsOrganiser(webhook.eventId, user);
	await Webhook.deleteOne({ _id: webhook._id });
	await auditService.record(null, ACTIONS.WEBHOOK_DELETED, {
		actorId: user._id,
		eventId: webhook.eventId,
		targetType: "webhook",
		targetId: webhook._id,
		meta: { url: webhook.url },
	});
	return { removed: true };
};

export const deliveriesFor = async (webhookId, user, { limit = 50 } = {}) => {
	const webhook = await Webhook.findById(webhookId);
	if (!webhook) throw fail("Webhook not found", 404);
	await loadEventAsOrganiser(webhook.eventId, user);
	return await WebhookDelivery.find({ webhookId })
		.sort({ createdAt: -1 })
		.limit(Math.min(Number(limit) || 50, 200));
};

export const signature = (secret, body) =>
	"sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

/** One HTTP attempt against the receiver. Returns what to write on the row. */
const attempt = async (webhook, delivery) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(webhook.url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "Verdikt-Webhook/1.0",
				"X-Verdikt-Event": delivery.type,
				"X-Verdikt-Delivery": delivery._id.toString(),
				"X-Verdikt-Signature": signature(webhook.secret, delivery.body),
			},
			body: delivery.body,
			redirect: "manual",
			signal: controller.signal,
		});
		if (res.status >= 200 && res.status < 300) {
			return { ok: true, responseStatus: res.status };
		}
		return { ok: false, responseStatus: res.status, error: `Receiver answered ${res.status}` };
	} catch (error) {
		return { ok: false, responseStatus: null, error: error.message || "Request failed" };
	} finally {
		clearTimeout(timer);
	}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attempt, retry on failure, and keep the row honest throughout. */
const deliverWithRetries = async (webhook, delivery) => {
	for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
		if (i > 0) await sleep(RETRY_DELAYS_MS[i - 1]);
		const result = await attempt(webhook, delivery);
		delivery.attempts += 1;
		delivery.responseStatus = result.responseStatus;
		delivery.error = result.ok ? null : result.error;
		if (result.ok) {
			delivery.status = "delivered";
			delivery.deliveredAt = new Date();
			await delivery.save();
			return;
		}
		delivery.status = "failed";
		await delivery.save();
	}
};

/**
 * Fire one payload at every live subscription on the event that wants this
 * type. Never throws and never blocks the caller: the caller's own work is
 * done, and a webhook problem is the organizer's dashboard's problem.
 */
export const dispatch = (eventId, type, data) => {
	const chain = (async () => {
		try {
			const hooks = await Webhook.find({ eventId, active: true });
			const wanted = hooks.filter((h) => h.events.length === 0 || h.events.includes(type));
			if (wanted.length === 0) return;

			const body = JSON.stringify({
				type,
				eventId: eventId.toString(),
				firedAt: new Date().toISOString(),
				data,
			});

			await Promise.allSettled(
				wanted.map(async (webhook) => {
					const delivery = await WebhookDelivery.create({
						webhookId: webhook._id,
						eventId,
						type,
						body,
					});
					await deliverWithRetries(webhook, delivery);
				}),
			);
		} catch (error) {
			console.error(`webhooks: dispatch of ${type} failed:`, error.message);
		}
	})();
	return track(chain);
};

/** Sign and send byte-for-byte the same body again, at the organizer's ask. */
export const redeliver = async (deliveryId, user) => {
	const delivery = await WebhookDelivery.findById(deliveryId);
	if (!delivery) throw fail("Delivery not found", 404);
	const webhook = await Webhook.findById(delivery.webhookId);
	if (!webhook) throw fail("Webhook not found", 404);
	await loadEventAsOrganiser(webhook.eventId, user);

	const result = await attempt(webhook, delivery);
	delivery.attempts += 1;
	delivery.responseStatus = result.responseStatus;
	delivery.error = result.ok ? null : result.error;
	if (result.ok) {
		delivery.status = "delivered";
		delivery.deliveredAt = new Date();
	} else {
		delivery.status = "failed";
	}
	await delivery.save();
	return delivery;
};
