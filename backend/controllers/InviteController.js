import * as inviteService from "../services/InviteService.js";

export const create = async (req, res, next) => {
	try {
		const invite = await inviteService.createInvite(
			req.body.teamId,
			req.user._id,
		);
		res.status(201).json({
			success: true,
			data: invite,
			message: "Invite link created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const invite = await inviteService.getInviteById(req.params.id);
		res.json({
			success: true,
			data: invite,
			message: "Invite retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getByToken = async (req, res, next) => {
	try {
		const invite = await inviteService.getInviteByToken(req.params.token);
		res.json({
			success: true,
			data: invite,
			message: "Invite details retrieved",
		});
	} catch (error) {
		next(error);
	}
};

export const accept = async (req, res, next) => {
	try {
		const team = await inviteService.acceptInvite(
			req.params.token,
			req.user._id,
		);
		res.json({
			success: true,
			data: team,
			message: "You have joined the team!",
		});
	} catch (error) {
		next(error);
	}
};

export const getAll = async (req, res, next) => {
	try {
		const filter = {};
		if (req.query.teamId) filter.teamId = req.query.teamId;
		const invites = await inviteService.getAllInvites(filter);
		res.json({
			success: true,
			data: invites,
			message: "Invites retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await inviteService.deleteInvite(req.params.id, req.user._id);
		res.json({
			success: true,
			data: null,
			message: "Invite deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const sendDirectInvite = async (req, res, next) => {
    try {
        const invite = await inviteService.sendDirectInvite(req.body.teamId, req.body.targetUserId, req.user);
        res.status(201).json({ success: true, data: invite, message: "Direct invite sent successfully" });
    } catch (error) { next(error); }
};
