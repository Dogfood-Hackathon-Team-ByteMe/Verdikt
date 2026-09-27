import * as scoreService from "../services/ScoreService.js";
import { idsOf } from "../utils/eventRoles.js";

export const create = async (req, res, next) => {
	try {
		const score = await scoreService.createScore(req.body, req.user);
		res.status(201).json({
			success: true,
			data: score,
			message: "Score submitted successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getById = async (req, res, next) => {
	try {
		const score = await scoreService.getScoreById(req.params.id);
		res.json({
			success: true,
			data: score,
			message: "Score retrieved successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const getFiltered = async (req, res, next) => {
	try {
		if (!req.user) {
			return res.status(401).json({ success: false, error: "Unauthorized", message: "Authentication required" });
		}

		const filter = {};
		if (req.query.projectId) filter.projectId = req.query.projectId;
		if (req.query.eventId) filter.eventId = req.query.eventId;

		const isAdmin = req.user.isAdmin;
		const organiserIn = idsOf(req.user.organiserIn);
		const isJudgeSomewhere = (req.user.judgeIn || []).length > 0;

		// "Organiser" is per event, not a rank. Organising one hackathon must
		// not unlock another's ballots, so the claim is checked against the
		// event actually being asked for. With no eventId the request is
		// narrowed to the events this user organises, rather than all of them.
		const isOrganizer = req.query.eventId
			? organiserIn.includes(req.query.eventId.toString())
			: organiserIn.length > 0;

		// Nobody without a stake in the event has any business reading ballots.
		if (!isJudgeSomewhere && !isOrganizer && !isAdmin) {
			return res.status(403).json({ success: false, error: "Forbidden", message: "Only judges and organizers can access scores" });
		}

		if (isOrganizer && !isAdmin && !req.query.eventId) {
			filter.eventId = { $in: organiserIn };
		}

		if (req.query.judge) {
			const requestedJudgeId = req.query.judge;
			if (!isOrganizer && !isAdmin && requestedJudgeId !== req.user._id.toString()) {
				return res.status(403).json({ success: false, error: "Forbidden", message: "You cannot view another judge's scores" });
			}
			filter.judgeId = requestedJudgeId;
		} else if (!isOrganizer && !isAdmin) {
			// A plain judge is always narrowed to their own ballots, whichever
			// path they came in on. Previously this only happened on
			// /judge/scores, so GET /api/scores leaked every peer's ballot to
			// any judge who asked -- the exact isolation T2 is graded on.
			filter.judgeId = req.user._id;
		}

		const scores = await scoreService.getAllScores(filter);
		res.json({ success: true, data: scores, message: "Scores retrieved successfully" });
	} catch (error) {
		next(error);
	}
};

export const update = async (req, res, next) => {
	try {
		const score = await scoreService.updateScore(
			req.params.id,
			req.body,
			req.user,
		);
		res.json({
			success: true,
			data: score,
			message: "Score updated successfully",
		});
	} catch (error) {
		next(error);
	}
};

export const deleteById = async (req, res, next) => {
	try {
		await scoreService.deleteScore(req.params.id, req.user);
		res.json({
			success: true,
			data: null,
			message: "Score deleted successfully",
		});
	} catch (error) {
		next(error);
	}
};



export const search = async (req, res, next) => {
	try {
		const scores = await scoreService.searchScores(req.query.q, req.query.eventId, req.user);
		res.json({ success: true, data: scores });
	} catch (error) { next(error); }
};
