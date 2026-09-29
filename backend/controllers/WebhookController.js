import * as webhookService from "../services/WebhookService.js";

export const create = async (req, res, next) => {
	try {
		const webhook = await webhookService.create(req.params.id, req.user, req.body);
		res.status(201).json({ success: true, data: webhook, message: "Webhook registered" });
	} catch (error) {
		next(error);
	}
};

export const listForEvent = async (req, res, next) => {
	try {
		const webhooks = await webhookService.listForEvent(req.params.id, req.user);
		res.json({ success: true, data: webhooks });
	} catch (error) {
		next(error);
	}
};

export const remove = async (req, res, next) => {
	try {
		const result = await webhookService.remove(req.params.id, req.user);
		res.json({ success: true, data: result, message: "Webhook removed" });
	} catch (error) {
		next(error);
	}
};

export const deliveries = async (req, res, next) => {
	try {
		const rows = await webhookService.deliveriesFor(req.params.id, req.user, req.query);
		res.json({ success: true, data: rows });
	} catch (error) {
		next(error);
	}
};

export const redeliver = async (req, res, next) => {
	try {
		const delivery = await webhookService.redeliver(req.params.deliveryId, req.user);
		res.json({ success: true, data: delivery, message: "Redelivered" });
	} catch (error) {
		next(error);
	}
};
