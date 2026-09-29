/**
 * Certificates and signed records (T4).
 *
 * Three kinds, one machinery:
 *   participation  every member of every team that submitted an entry
 *   placement      the members of one entry the organizer places (1st, 2nd...)
 *   judge          a judge's participation record: event, tracks, ballots cast
 *
 * Each is a JSON record signed with the instance's Ed25519 key. Verification
 * is public and keyless -- GET /api/v1/certificates/:serial hands back the
 * record, the signature and the public key, so anyone (an employer, another
 * organizer) can check a claim without an account here, or verify offline
 * with nothing but the public key. That is what makes a judge's record
 * "publicly verifiable" rather than "a row in our database".
 *
 * No email service exists, so nothing is sent anywhere: recipients see their
 * certificates in the app, and each has a public link to hand out.
 */
import crypto from "crypto";
import Certificate from "../models/Certificate.js";
import SigningKey from "../models/SigningKey.js";
import Event from "../models/Event.js";
import Project from "../models/Project.js";
import Score from "../models/Score.js";
import Team from "../models/Team.js";
import Track from "../models/Track.js";
import User from "../models/User.js";
import * as auditService from "./AuditService.js";
import { ACTIONS } from "./AuditService.js";

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const KEY_NAME = "verdikt-signing-key";

/** The instance keypair, minted on first use. The unique index breaks ties. */
export const getKeyPair = async () => {
	const existing = await SigningKey.findOne({ name: KEY_NAME });
	if (existing) return existing;

	const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
	try {
		return await SigningKey.create({
			name: KEY_NAME,
			publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
			privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
		});
	} catch (error) {
		// A concurrent first-writer beat us to it; theirs is the keypair now.
		if (error.code === 11000) return await SigningKey.findOne({ name: KEY_NAME });
		throw error;
	}
};

export const publicKeyPem = async () => (await getKeyPair()).publicKeyPem;

const signRecord = (recordJson, privateKeyPem) =>
	crypto
		.sign(null, Buffer.from(recordJson, "utf8"), crypto.createPrivateKey(privateKeyPem))
		.toString("base64");

export const verifySignature = (recordJson, signatureB64, publicKeyPemText) => {
	try {
		return crypto.verify(
			null,
			Buffer.from(recordJson, "utf8"),
			crypto.createPublicKey(publicKeyPemText),
			Buffer.from(signatureB64, "base64"),
		);
	} catch {
		return false;
	}
};

const loadEventAsOrganiser = async (eventId, user) => {
	const event = await Event.findById(eventId);
	if (!event) throw fail("Event not found", 404);
	const isOrganiser = user.organiserIn?.some((id) => id.toString() === event._id.toString());
	if (!isOrganiser && !user.isAdmin) {
		throw fail("Only the event organiser can issue certificates", 403);
	}
	return event;
};

/** Issue one certificate, or quietly return the one already issued. */
const issueOne = async ({ event, kind, recipient, details, projectId, issuedBy, keys }) => {
	const serial = crypto.randomUUID();
	const record = JSON.stringify({
		version: 1,
		serial,
		kind,
		event: { id: event._id.toString(), name: event.name },
		recipient: { name: recipient.name },
		...details,
		issuedAt: new Date().toISOString(),
	});

	try {
		return await Certificate.create({
			serial,
			eventId: event._id,
			kind,
			recipientUserId: recipient._id,
			recipientName: recipient.name,
			projectId: projectId ?? null,
			record,
			signature: signRecord(record, keys.privateKeyPem),
			issuedBy,
		});
	} catch (error) {
		if (error.code === 11000) {
			// Already issued: idempotent, and the original keeps its serial.
			return await Certificate.findOne({
				eventId: event._id,
				kind,
				recipientUserId: recipient._id,
				projectId: projectId ?? null,
			});
		}
		throw error;
	}
};

/** Members (populated) of every team that submitted an entry in the event. */
const submittedTeams = async (eventId) => {
	const projects = await Project.find({ eventId, status: "submitted" }).populate({
		path: "teamId",
		populate: { path: "members", select: "name" },
	});
	return projects.filter((p) => p.teamId);
};

export const issueParticipation = async (eventId, user) => {
	const event = await loadEventAsOrganiser(eventId, user);
	const keys = await getKeyPair();
	const entries = await submittedTeams(eventId);
	if (entries.length === 0) throw fail("Nothing has been submitted yet, so there is nobody to certify.", 400);

	const issued = [];
	for (const project of entries) {
		for (const member of project.teamId.members ?? []) {
			issued.push(
				await issueOne({
					event,
					kind: "participation",
					recipient: member,
					projectId: project._id,
					details: {
						team: project.teamId.name,
						project: project.title,
					},
					issuedBy: user._id,
					keys,
				}),
			);
		}
	}

	await auditService.record(null, ACTIONS.CERTIFICATES_ISSUED, {
		actorId: user._id,
		eventId,
		meta: { kind: "participation", count: issued.length },
	});
	return issued;
};

export const issuePlacement = async (eventId, user, { projectId, place } = {}) => {
	const event = await loadEventAsOrganiser(eventId, user);

	const rank = Number(place);
	if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
		throw fail("Place must be a whole number from 1 up", 400);
	}

	const project = await Project.findById(projectId).populate({
		path: "teamId",
		populate: { path: "members", select: "name" },
	});
	if (!project || project.eventId.toString() !== event._id.toString()) {
		throw fail("That project is not part of this event", 404);
	}
	if (project.status !== "submitted") throw fail("A draft cannot be placed", 400);
	if (!project.teamId) throw fail("This project has no team to certify", 400);

	const keys = await getKeyPair();
	const issued = [];
	for (const member of project.teamId.members ?? []) {
		issued.push(
			await issueOne({
				event,
				kind: "placement",
				recipient: member,
				projectId: project._id,
				details: {
					team: project.teamId.name,
					project: project.title,
					place: rank,
				},
				issuedBy: user._id,
				keys,
			}),
		);
	}

	await auditService.record(null, ACTIONS.CERTIFICATES_ISSUED, {
		actorId: user._id,
		eventId,
		meta: { kind: "placement", place: rank, count: issued.length },
	});
	return issued;
};

/**
 * Signed judge participation records: one per judge who actually cast a
 * ballot. A judge who never scored gets no record -- the record certifies
 * work done, not a name on a list.
 */
export const issueJudgeRecords = async (eventId, user) => {
	const event = await loadEventAsOrganiser(eventId, user);
	const keys = await getKeyPair();

	const counts = await Score.aggregate([
		{ $match: { eventId: event._id } },
		{ $group: { _id: "$judgeId", ballots: { $sum: 1 } } },
	]);
	if (counts.length === 0) throw fail("No ballots have been cast yet, so there is nothing to certify.", 400);

	const eventTracks = await Track.find({ eventId }, { topic: 1, judges: 1 });

	const issued = [];
	for (const row of counts) {
		const judge = await User.findById(row._id, { name: 1 });
		if (!judge) continue;
		const tracks = eventTracks
			.filter((t) => (t.judges ?? []).some((j) => j.toString() === judge._id.toString()))
			.map((t) => t.topic);
		issued.push(
			await issueOne({
				event,
				kind: "judge",
				recipient: judge,
				projectId: null,
				details: {
					role: "judge",
					tracks,
					ballotsCast: row.ballots,
				},
				issuedBy: user._id,
				keys,
			}),
		);
	}

	await auditService.record(null, ACTIONS.CERTIFICATES_ISSUED, {
		actorId: user._id,
		eventId,
		meta: { kind: "judge", count: issued.length },
	});
	return issued;
};

export const listForEvent = async (eventId, user) => {
	await loadEventAsOrganiser(eventId, user);
	return await Certificate.find({ eventId }).sort({ createdAt: -1 });
};

/** The signed-in user's own certificates, across every event. */
export const listMine = async (user) =>
	await Certificate.find({ recipientUserId: user._id }).sort({ createdAt: -1 }).populate("eventId", "name");

/**
 * Public verification by serial. The record travels back as the exact signed
 * string plus its parsed form, the signature, and the public key -- everything
 * a stranger needs to re-run the maths themselves.
 */
export const verifyBySerial = async (serial) => {
	const cert = await Certificate.findOne({ serial: String(serial ?? "") });
	if (!cert) throw fail("No certificate with that serial", 404);

	const publicKey = await publicKeyPem();
	return {
		serial: cert.serial,
		kind: cert.kind,
		record: cert.record,
		details: JSON.parse(cert.record),
		signature: cert.signature,
		publicKeyPem: publicKey,
		valid: verifySignature(cert.record, cert.signature, publicKey),
	};
};
