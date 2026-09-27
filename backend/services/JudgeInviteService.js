/**
 * Judge invites: appoint someone by link, before or after they have an account.
 *
 * Appointing by email (TrackService.assignJudge) only works for someone who has
 * already signed up. An invite covers everyone else: the organiser sends a
 * link, the judge signs up or signs in with the invited address, and accepting
 * runs the same appointJudge() every other route to the panel uses -- so the
 * competing/organising checks happen at the moment they accept, against who
 * they are then.
 */
import crypto from "node:crypto";
import JudgeInvite from "../models/JudgeInvite.js";
import Track from "../models/Track.js";
import User from "../models/User.js";
import { runInTransaction } from "../utils/transaction.js";
import { isOrganiserOf } from "../utils/eventRoles.js";
import { appointJudge } from "./TrackService.js";

const LIFETIME_DAYS = 14;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** Where an invite stands, computed rather than stored so it cannot go stale. */
const statusOf = (invite, now = new Date()) => {
	if (invite.revokedAt) return "revoked";
	if (invite.acceptedAt) return "accepted";
	if (invite.expiresAt < now) return "expired";
	return "pending";
};

/**
 * "n***@example.org". Enough for the holder to recognise which account to sign
 * in with, without a leaked link also leaking the whole address.
 */
const mask = (email) => {
	const [local, domain] = email.split("@");
	return `${local.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(local.length - 1, 3)))}@${domain}`;
};

const loadTrackAsOrganiser = async (trackId, user) => {
	const track = await Track.findById(trackId);
	if (!track) throw fail("Track not found", 404);
	if (!user.isAdmin && !isOrganiserOf(user, track.eventId)) {
		throw fail("Only the organiser of this event can invite judges", 403);
	}
	return track;
};

/** The organiser's view of an invite: everything, including the token. */
const forOrganiser = (invite) => ({
	_id: invite._id,
	trackId: invite.trackId,
	email: invite.email,
	token: invite.token,
	status: statusOf(invite),
	expiresAt: invite.expiresAt,
	acceptedAt: invite.acceptedAt,
	createdAt: invite.createdAt,
});

export const createInvite = async (trackId, email, user) => {
	const track = await loadTrackAsOrganiser(trackId, user);

	const address = typeof email === "string" ? email.trim().toLowerCase() : "";
	if (!EMAIL.test(address)) throw fail("A valid email address is required", 400);

	// An open invite for the same person on the same track would just be a
	// second live credential for one seat. Hand back the existing one instead.
	const open = await JudgeInvite.findOne({
		trackId: track._id,
		email: address,
		acceptedAt: null,
		revokedAt: null,
		expiresAt: { $gt: new Date() },
	});
	if (open) return forOrganiser(open);

	const invite = await JudgeInvite.create({
		eventId: track.eventId,
		trackId: track._id,
		email: address,
		token: crypto.randomBytes(24).toString("hex"),
		createdBy: user._id,
		expiresAt: new Date(Date.now() + LIFETIME_DAYS * 24 * 3600_000),
	});
	return forOrganiser(invite);
};

export const listForTrack = async (trackId, user) => {
	await loadTrackAsOrganiser(trackId, user);
	const invites = await JudgeInvite.find({ trackId }).sort({ createdAt: -1 });
	return invites.map(forOrganiser);
};

export const revokeInvite = async (inviteId, user) => {
	const invite = await JudgeInvite.findById(inviteId);
	if (!invite) throw fail("Invite not found", 404);
	await loadTrackAsOrganiser(invite.trackId, user);
	if (invite.acceptedAt) throw fail("That invite was already accepted. Remove the judge from the track instead.", 409);
	invite.revokedAt = new Date();
	await invite.save();
	return forOrganiser(invite);
};

/**
 * What someone holding the link may see before they commit: which event and
 * track, and a masked hint of the address it is for. Public, like a team invite
 * preview -- you should know what you are agreeing to before you sign up.
 */
export const previewInvite = async (token) => {
	const invite = await JudgeInvite.findOne({ token }).populate("eventId", "name").populate("trackId", "topic");
	if (!invite) throw fail("This invite link is not valid", 404);
	return {
		eventId: invite.eventId?._id,
		eventName: invite.eventId?.name ?? null,
		trackName: invite.trackId?.topic ?? null,
		emailHint: mask(invite.email),
		status: statusOf(invite),
		expiresAt: invite.expiresAt,
	};
};

export const acceptInvite = async (token, user) => {
	const invite = await JudgeInvite.findOne({ token });
	if (!invite) throw fail("This invite link is not valid", 404);

	const status = statusOf(invite);
	if (status === "accepted") throw fail("This invite has already been used", 409);
	if (status === "revoked") throw fail("This invite was withdrawn by the organiser", 410);
	if (status === "expired") throw fail("This invite has expired. Ask the organiser for a new one.", 410);

	// The binding that makes a forwarded link worthless. Deliberately does not
	// say which address the invite IS for -- the preview's masked hint already
	// told the rightful holder.
	if (String(user.email).toLowerCase() !== invite.email) {
		throw fail("This invite was sent to a different email address. Sign in with that account to accept it.", 403);
	}

	const track = await Track.findById(invite.trackId);
	if (!track) throw fail("The track this invite was for no longer exists", 410);

	await runInTransaction(async (session) => {
		// Fresh read inside the transaction: participation is checked against
		// who they are now, not when the organiser sent the link.
		const judge = await User.findById(user._id).session(session);
		await appointJudge(track, judge, session);

		// Claim the invite atomically. A double-click, or two tabs, must not
		// both succeed on a single-use link.
		const claimed = await JudgeInvite.findOneAndUpdate(
			{ _id: invite._id, acceptedAt: null, revokedAt: null },
			{ acceptedAt: new Date(), acceptedBy: user._id },
			{ new: true, session },
		);
		if (!claimed) throw fail("This invite has already been used", 409);
	});

	return { eventId: invite.eventId, trackId: invite.trackId };
};
