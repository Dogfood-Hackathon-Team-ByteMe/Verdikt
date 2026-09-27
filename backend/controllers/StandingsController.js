import * as standingsService from "../services/StandingsService.js";
import * as exportService from "../services/ExportService.js";

const sendCsv = (res, filename, csv) => {
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
	res.send(csv);
};

export const getForEvent = async (req, res, next) => {
	try {
		const standings = await standingsService.getStandings(req.params.id, req.user, { method: req.query.method });
		res.json({ success: true, data: standings, message: "Standings computed" });
	} catch (error) {
		next(error);
	}
};

export const getCsvForEvent = async (req, res, next) => {
	try {
		sendCsv(res, "standings.csv", await exportService.standingsCsv(req.params.id, req.user, { method: req.query.method }));
	} catch (error) {
		next(error);
	}
};

export const getEntriesCsv = async (req, res, next) => {
	try {
		sendCsv(res, "entries.csv", await exportService.entriesCsv(req.params.id, req.user));
	} catch (error) {
		next(error);
	}
};

export const getAssignmentsCsv = async (req, res, next) => {
	try {
		sendCsv(res, "assignments.csv", await exportService.assignmentsCsv(req.params.id, req.user));
	} catch (error) {
		next(error);
	}
};

export const getBallotsCsv = async (req, res, next) => {
	try {
		sendCsv(res, "scores_export.csv", await exportService.ballotsCsv(req.query.eventId, req.user));
	} catch (error) {
		next(error);
	}
};
