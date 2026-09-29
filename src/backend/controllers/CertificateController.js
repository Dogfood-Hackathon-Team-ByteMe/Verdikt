import * as certificateService from "../services/CertificateService.js";

export const issue = async (req, res, next) => {
	try {
		const { kind } = req.body ?? {};
		let issued;
		if (kind === "participation") {
			issued = await certificateService.issueParticipation(req.params.id, req.user);
		} else if (kind === "placement") {
			issued = await certificateService.issuePlacement(req.params.id, req.user, req.body);
		} else if (kind === "judge") {
			issued = await certificateService.issueJudgeRecords(req.params.id, req.user);
		} else {
			return res.status(400).json({
				success: false,
				message: "kind must be participation, placement or judge",
			});
		}
		res.status(201).json({ success: true, data: issued, message: `${issued.length} issued` });
	} catch (error) {
		next(error);
	}
};

export const listForEvent = async (req, res, next) => {
	try {
		const rows = await certificateService.listForEvent(req.params.id, req.user);
		res.json({ success: true, data: rows });
	} catch (error) {
		next(error);
	}
};

export const mine = async (req, res, next) => {
	try {
		const rows = await certificateService.listMine(req.user);
		res.json({ success: true, data: rows });
	} catch (error) {
		next(error);
	}
};

export const verify = async (req, res, next) => {
	try {
		const result = await certificateService.verifyBySerial(req.params.serial);
		res.json({ success: true, data: result });
	} catch (error) {
		next(error);
	}
};

export const publicKey = async (req, res, next) => {
	try {
		const pem = await certificateService.publicKeyPem();
		res.json({ success: true, data: { algorithm: "ed25519", publicKeyPem: pem } });
	} catch (error) {
		next(error);
	}
};
