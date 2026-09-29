import * as voteService from "../services/VoteService.js";

export const cast = async (req, res, next) => {
	try {
		const tally = await voteService.castVote(req.params.id, req.user);
		res.status(201).json({ success: true, data: tally, message: "Vote counted" });
	} catch (error) {
		next(error);
	}
};

export const withdraw = async (req, res, next) => {
	try {
		const tally = await voteService.withdrawVote(req.params.id, req.user);
		res.json({ success: true, data: tally, message: "Vote withdrawn" });
	} catch (error) {
		next(error);
	}
};

export const communityStandings = async (req, res, next) => {
	try {
		const poll = await voteService.summariseVotes(req.params.id);
		res.json({ success: true, data: poll });
	} catch (error) {
		next(error);
	}
};
