/**
 * The OpenAPI 3.0 description of the whole HTTP surface -- the session API the
 * SPA drives (which covers every action the UI can take, because the SPA has
 * no other road to the backend) and the keyless /api/v1 read surface.
 *
 * Served at GET /api/v1/openapi.json. Kept as one literal object: no
 * generation step, no drift-prone annotations, and a route added without a
 * matching entry here shows up in review as exactly that.
 */

const ok = (description = "OK") => ({
	description,
	content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
});

const err = (code, description) => [code, { description }];

const RESPONSES = Object.fromEntries([
	err("400", "Malformed request"),
	err("401", "No session"),
	err("403", "Signed in, but not allowed"),
	err("404", "No such record"),
	err("429", "Rate limited; the body says how long to wait"),
]);

const p = (name, description, where = "path") => ({
	name,
	in: where,
	required: where === "path",
	description,
	schema: { type: "string" },
});

const body = (properties, required = []) => ({
	required: true,
	content: {
		"application/json": { schema: { type: "object", properties, required } },
	},
});

const route = (summary, options = {}) => ({
	summary,
	...(options.tags ? { tags: options.tags } : {}),
	...(options.parameters ? { parameters: options.parameters } : {}),
	...(options.requestBody ? { requestBody: options.requestBody } : {}),
	responses: { 200: ok(), ...RESPONSES, ...(options.responses ?? {}) },
});

const id = p("id", "Record id");

export const openapiSpec = {
	openapi: "3.0.3",
	info: {
		title: "Verdikt API",
		version: "1.0.0",
		description:
			"The complete HTTP surface of a Verdikt instance. Authentication is an httpOnly session cookie from POST /api/auth/login or /register; the /api/v1 paths are keyless, GET-only and rate-limited per address. Every role rule is enforced here, not in the UI.",
	},
	servers: [{ url: "http://localhost:8080" }],
	tags: [
		{ name: "auth", description: "Sessions and accounts" },
		{ name: "events", description: "Events, rubric, standings, exports" },
		{ name: "tracks", description: "Tracks and their judging panels" },
		{ name: "teams", description: "Teams and invite links" },
		{ name: "projects", description: "Entries: drafts, submission, gallery, votes, comments" },
		{ name: "judging", description: "Ballots, queues and batch assignment" },
		{ name: "webhooks", description: "T4: signed deliveries to organizer endpoints" },
		{ name: "certificates", description: "T4: signed certificates and judge records" },
		{ name: "portability", description: "T4: bulk export and import" },
		{ name: "public", description: "The keyless /api/v1 read surface" },
	],
	paths: {
		"/health": { get: route("Liveness probe; touches no database") },

		"/api/auth/register": {
			post: route("Create an account and sign it in", {
				tags: ["auth"],
				requestBody: body(
					{ email: { type: "string" }, password: { type: "string", minLength: 8 }, name: { type: "string" } },
					["email", "password"],
				),
			}),
		},
		"/api/auth/login": {
			post: route("Sign in; failures are rate-limited per account and per address", {
				tags: ["auth"],
				requestBody: body({ email: { type: "string" }, password: { type: "string" } }, ["email", "password"]),
			}),
		},
		"/api/auth/logout": { post: route("Revoke the session cookie", { tags: ["auth"] }) },
		"/api/auth/me": { get: route("The signed-in user, with their per-event roles resolved", { tags: ["auth"] }) },

		"/api/users": {
			get: route("List users (signed in); never includes password hashes", { tags: ["auth"] }),
			post: route("Create a user (admin only)", { tags: ["auth"] }),
		},
		"/api/users/{id}": {
			get: route("One user's public profile", { tags: ["auth"], parameters: [id] }),
			put: route("Edit your own profile; a password change needs the current one", { tags: ["auth"], parameters: [id] }),
		},

		"/api/events": {
			get: route("List events (public)", { tags: ["events"] }),
			post: route("Create an event; the caller becomes its organiser", {
				tags: ["events"],
				requestBody: body(
					{
						name: { type: "string" },
						description: { type: "string" },
						startsAt: { type: "string", format: "date-time" },
						submissionsClose: { type: "string", format: "date-time" },
						minTeamSize: { type: "integer" },
						maxTeamSize: { type: "integer" },
						prizes: { type: "array", items: { type: "object" } },
						customQuestions: { type: "array", items: { type: "object" } },
						criteria: {
							type: "array",
							description: "The scoring rubric: key, label, weight, maxScore per criterion",
							items: { type: "object" },
						},
					},
					["name", "submissionsClose"],
				),
			}),
		},
		"/api/events/featured": { get: route("The event the landing page features (public)", { tags: ["events"] }) },
		"/api/events/{id}": {
			get: route("One event (public)", { tags: ["events"], parameters: [id] }),
			put: route("Update your own event; role grants in the body are ignored", { tags: ["events"], parameters: [id] }),
			delete: route("Delete your own event", { tags: ["events"], parameters: [id] }),
		},
		"/api/events/{id}/standings": {
			get: route("The computed leaderboard, raw and normalized. Organiser or admin only", {
				tags: ["events"],
				parameters: [id, p("method", "Ranking method: raw or normalized", "query")],
			}),
		},
		"/api/events/{id}/standings.csv": { get: route("Standings as CSV (organiser)", { tags: ["events"], parameters: [id] }) },
		"/api/events/{id}/entries.csv": { get: route("Every entry as CSV, drafts included (organiser)", { tags: ["events"], parameters: [id] }) },
		"/api/events/{id}/assignments.csv": { get: route("Assignments as CSV (organiser)", { tags: ["events"], parameters: [id] }) },
		"/api/events/{id}/audit": { get: route("This event's audit trail (organiser)", { tags: ["events"], parameters: [id] }) },
		"/api/events/{id}/community": { get: route("The community poll (public)", { tags: ["events"], parameters: [id] }) },
		"/api/events/{id}/participants": { get: route("Who is taking part (event roles only)", { tags: ["events"], parameters: [id] }) },

		"/api/events/{id}/assignments": {
			get: route("List assignments (organiser)", { tags: ["judging"], parameters: [id] }),
			post: route("Add one assignment by hand (organiser)", {
				tags: ["judging"],
				parameters: [id],
				requestBody: body({ judgeId: { type: "string" }, projectId: { type: "string" } }, ["judgeId", "projectId"]),
			}),
			delete: route("Clear every assignment; judges return to scoring by track", { tags: ["judging"], parameters: [id] }),
		},
		"/api/events/{id}/assignments/auto": {
			post: route("Deal N reviews per entry: track-isolated, load-balanced, shortfall reported", {
				tags: ["judging"],
				parameters: [id],
				requestBody: body({ reviewsPerProject: { type: "integer", minimum: 1, maximum: 10 } }, ["reviewsPerProject"]),
			}),
		},
		"/api/judge/queue": {
			get: route("The signed-in judge's own queue for one event, in their own shuffled order", {
				tags: ["judging"],
				parameters: [p("eventId", "The event", "query")],
			}),
		},
		"/api/scores": {
			get: route("Ballots: a judge sees only their own; an organiser their event's", { tags: ["judging"] }),
			post: route("Cast a ballot (judge, in scope, rubric-checked)", { tags: ["judging"] }),
		},
		"/api/scores/ballot": {
			put: route("Create or replace your ballot on an entry", {
				tags: ["judging"],
				requestBody: body(
					{ projectId: { type: "string" }, scores: { type: "object" }, comment: { type: "string" } },
					["projectId", "scores"],
				),
			}),
		},

		"/api/tracks": {
			get: route("List tracks (public; judge emails redacted)", { tags: ["tracks"] }),
			post: route("Create a track on your event", { tags: ["tracks"] }),
		},
		"/api/tracks/{id}/judges": {
			post: route("Appoint a judge by account email (organiser)", {
				tags: ["tracks"],
				parameters: [id],
				requestBody: body({ email: { type: "string" } }, ["email"]),
			}),
		},
		"/api/tracks/{id}/judges/{userId}": {
			delete: route("Remove a judge; never widens their access", { tags: ["tracks"], parameters: [id, p("userId", "The judge")] }),
		},
		"/api/tracks/{id}/judge-invites": {
			get: route("List this track's judge invites (organiser)", { tags: ["tracks"], parameters: [id] }),
			post: route("Invite a judge by email: single-use, address-bound, expiring", { tags: ["tracks"], parameters: [id] }),
		},
		"/api/judge-invites/token/{token}": {
			get: route("Preview an invite; the address is masked", { tags: ["tracks"], parameters: [p("token", "Invite token")] }),
		},
		"/api/judge-invites/token/{token}/accept": {
			post: route("Accept a judge invite as the invited account", { tags: ["tracks"], parameters: [p("token", "Invite token")] }),
		},

		"/api/teams": {
			get: route("List teams (public; no member emails)", { tags: ["teams"] }),
			post: route("Create a team; the caller leads it", { tags: ["teams"] }),
		},
		"/api/invites": { post: route("Mint a team invite link (leader)", { tags: ["teams"] }) },
		"/api/invites/token/{token}": { get: route("Preview a team invite", { tags: ["teams"], parameters: [p("token", "Invite token")] }) },
		"/api/invites/token/{token}/accept": {
			post: route("Join the team, if the event's rules allow you to compete", { tags: ["teams"], parameters: [p("token", "Invite token")] }),
		},

		"/api/projects": {
			get: route("The gallery: submitted entries for everyone, your drafts for you", {
				tags: ["projects"],
				parameters: [p("search", "Title, tagline or tag", "query"), p("trackId", "Filter by track", "query")],
			}),
			post: route("Create a draft (team member, before the deadline)", { tags: ["projects"] }),
		},
		"/api/projects/{id}": {
			get: route("One entry; drafts answer only to their team and organiser", { tags: ["projects"], parameters: [id] }),
			put: route("Edit a draft before the deadline; status and team are not writable", { tags: ["projects"], parameters: [id] }),
			delete: route("Delete (leader, before the deadline)", { tags: ["projects"], parameters: [id] }),
		},
		"/api/projects/{id}/submit": { post: route("Submit: deadline, track and required answers all checked now", { tags: ["projects"], parameters: [id] }) },
		"/api/projects/{id}/unsubmit": { post: route("Withdraw to draft while the window is open", { tags: ["projects"], parameters: [id] }) },
		"/api/projects/{id}/vote": {
			post: route("One community vote per person; the wrong people are refused", { tags: ["projects"], parameters: [id] }),
			delete: route("Take your vote back", { tags: ["projects"], parameters: [id] }),
		},
		"/api/projects/{id}/comments": {
			get: route("Read the thread (public)", { tags: ["projects"], parameters: [id] }),
			post: route("Comment (signed in, rate-limited)", { tags: ["projects"], parameters: [id] }),
		},
		"/api/comments/{id}": { delete: route("Author takes it back, or organiser moderates (audited)", { tags: ["projects"], parameters: [id] }) },

		"/api/events/{id}/webhooks": {
			get: route("List this event's webhooks, secrets included (organiser)", { tags: ["webhooks"], parameters: [id] }),
			post: route("Register an endpoint; the secret is server-minted", {
				tags: ["webhooks"],
				parameters: [id],
				requestBody: body(
					{
						url: { type: "string", description: "http or https" },
						events: {
							type: "array",
							description: "Delivery types wanted; empty means all",
							items: {
								type: "string",
								enum: [
									"project.submitted",
									"project.withdrawn",
									"ballot.cast",
									"judge.appointed",
									"judge.removed",
									"assignments.dealt",
									"comment.created",
									"vote.cast",
								],
							},
						},
					},
					["url"],
				),
			}),
		},
		"/api/webhooks/{id}": { delete: route("Remove a webhook (organiser, audited)", { tags: ["webhooks"], parameters: [id] }) },
		"/api/webhooks/{id}/deliveries": {
			get: route("The delivery log: status, attempts, response codes", { tags: ["webhooks"], parameters: [id] }),
		},
		"/api/webhooks/{id}/deliveries/{deliveryId}/redeliver": {
			post: route("Send byte-for-byte the same signed body again", { tags: ["webhooks"], parameters: [id, p("deliveryId", "The delivery")] }),
		},

		"/api/events/{id}/certificates": {
			get: route("Every certificate issued on this event (organiser)", { tags: ["certificates"], parameters: [id] }),
			post: route("Issue: participation to every submitted team, placement to one entry, or judge records", {
				tags: ["certificates"],
				parameters: [id],
				requestBody: body(
					{
						kind: { type: "string", enum: ["participation", "placement", "judge"] },
						projectId: { type: "string", description: "placement only" },
						place: { type: "integer", description: "placement only" },
					},
					["kind"],
				),
			}),
		},
		"/api/certificates/mine": { get: route("Your own certificates, across events", { tags: ["certificates"] }) },

		"/api/events/{id}/export": {
			get: route("The whole event as one JSON bundle: structure, panel, entries, ballots. No credentials", {
				tags: ["portability"],
				parameters: [id],
			}),
		},
		"/api/events/import": {
			post: route("Rebuild an event from a bundle; the importer becomes its organiser", {
				tags: ["portability"],
				requestBody: body({ format: { type: "string" }, version: { type: "integer" } }, ["format", "version"]),
			}),
		},

		"/api/v1": { get: route("The keyless surface describes itself", { tags: ["public"] }) },
		"/api/v1/events": { get: route("Public events", { tags: ["public"] }) },
		"/api/v1/events/{id}": { get: route("One public event", { tags: ["public"], parameters: [id] }) },
		"/api/v1/events/{id}/projects": { get: route("Submitted entries only, votes attached, roster withheld", { tags: ["public"], parameters: [id] }) },
		"/api/v1/events/{id}/community": { get: route("The community poll", { tags: ["public"], parameters: [id] }) },
		"/api/v1/events/{id}/embed": {
			get: route("The gallery as one self-contained HTML page, made to be iframed", { tags: ["public"], parameters: [id] }),
		},
		"/api/v1/projects/{id}": { get: route("One submitted entry", { tags: ["public"], parameters: [id] }) },
		"/api/v1/projects/{id}/comments": { get: route("A project's comment thread", { tags: ["public"], parameters: [id] }) },
		"/api/v1/certificates/{serial}": {
			get: route("Verify a certificate: record, signature, public key and the verdict", {
				tags: ["public"],
				parameters: [p("serial", "The certificate serial")],
			}),
		},
		"/api/v1/keys/current": { get: route("The instance's Ed25519 public key, for offline verification", { tags: ["public"] }) },
		"/api/v1/openapi.json": { get: route("This document", { tags: ["public"] }) },
	},
	components: {
		schemas: {
			Envelope: {
				type: "object",
				description: "Every JSON response: { success, data, message? }",
				properties: {
					success: { type: "boolean" },
					data: {},
					message: { type: "string" },
				},
				required: ["success"],
			},
		},
	},
};
