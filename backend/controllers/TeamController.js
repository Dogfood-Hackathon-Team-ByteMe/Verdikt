import * as teamService from "../services/TeamService.js";

export const create = async (req, res, next) => {
	try {
		const team = await teamService.createTeam(req.body, req.user);
		res.status(201).json({
			success: true,
			data: team,
			message: "Team created successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const team = await teamService.getTeamById(req.params.id);
		res.json({
			success: true,
			data: team,
			message: "Team retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getAll = async (req, res, next) => {
	try {
		const filter = {};
		if (req.query.eventId) filter.eventId = req.query.eventId;
		const teams = await teamService.getAllTeams(filter);
		res.json({
			success: true,
			data: teams,
			message: "Teams retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const team = await teamService.updateTeam(
			req.params.id,
			req.body,
			req.user,
		);
		res.json({
			success: true,
			data: team,
			message: "Team updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await teamService.deleteTeam(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "Team deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const addMember = async (req, res, next) => {
	try {
		const team = await teamService.addMember(
			req.params.id,
			req.body.userId,
			req.user,
		);
		res.json({
			success: true,
			data: team,
			message: "Member added successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const removeMember = async (req, res, next) => {
	try {
		const team = await teamService.removeMember(
			req.params.id,
			req.params.userId,
			req.user,
		);
		res.json({
			success: true,
			data: team,
			message: "Member removed successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const search = async (req, res, next) => {
	try {
		const teams = await teamService.searchTeams(req.query.q, req.query.eventId, req.user);
		res.json({ success: true, data: teams });
	} catch (error) { next(error); }
};
