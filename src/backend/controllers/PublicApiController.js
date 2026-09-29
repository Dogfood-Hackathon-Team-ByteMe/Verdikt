/**
 * The public read API, /api/v1.
 *
 * The rest of /api answers the SPA, cookie in hand, in whatever shape the
 * adapters expect that week. This surface is for everyone else -- a script
 * polling a leaderboard onto a venue screen, a site embedding the gallery --
 * so it makes three promises the private API does not:
 *
 *   - GET only, no cookie, no account. Nothing here mutates.
 *   - Every field is deliberately public. The serializers below are
 *     allow-lists; a field absent here is absent on purpose, and new model
 *     fields stay private until someone adds them by hand.
 *   - The v1 shape is stable. Fields may be added; renaming or removing one
 *     means /api/v2, not a quiet break.
 *
 * Documented in API.md. Rate-limited per address, because it is keyless.
 */
import * as eventRepository from "../repositories/EventRepository.js";
import * as projectRepository from "../repositories/ProjectRepository.js";
import * as voteService from "../services/VoteService.js";
import * as commentService from "../services/CommentService.js";

const notFound = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });

// --- Serializers: the allow-lists --------------------------------------------

const publicTrack = (track) =>
	typeof track === "object" && track !== null
		? { id: track._id, name: track.topic ?? null }
		: { id: track, name: null };

const publicEvent = (event) => ({
	id: event._id,
	name: event.name,
	tagline: event.tagline ?? null,
	description: event.description ?? null,
	startsAt: event.startsAt ?? null,
	submissionsClose: event.submissionsClose ?? null,
	tracks: (event.tracks ?? []).map(publicTrack),
	prizes: (event.prizes ?? []).map((p) => ({
		name: p.name,
		amountUsd: p.amountUsd ?? 0,
		description: p.description ?? null,
	})),
});

// Team members and their emails are deliberately absent: the team is public
// as a name, not as a roster.
const publicProject = (project, voteCount) => ({
	id: project._id,
	title: project.title,
	tagline: project.tagline ?? null,
	summary: project.summary ?? null,
	description: project.description ?? null,
	repoUrl: project.repoUrl ?? null,
	liveUrl: project.liveUrl ?? null,
	demoVideoUrl: project.demoVideoUrl ?? null,
	thumbnailUrl: project.thumbnailUrl ?? null,
	techTags: project.techTags ?? [],
	team: project.teamId?.name ?? null,
	track: project.trackId?.topic ?? null,
	submittedAt: project.submittedAt ?? null,
	voteCount,
});

// --- Handlers -----------------------------------------------------------------

/** The index describes the surface, so /api/v1 is its own quick reference. */
export const index = (req, res) => {
	res.json({
		success: true,
		data: {
			version: 1,
			documentation: "API.md in the repository",
			endpoints: [
				"GET /api/v1/events",
				"GET /api/v1/events/:id",
				"GET /api/v1/events/:id/projects",
				"GET /api/v1/events/:id/community",
				"GET /api/v1/events/:id/embed",
				"GET /api/v1/projects/:id",
				"GET /api/v1/projects/:id/comments",
				"GET /api/v1/certificates/:serial",
				"GET /api/v1/keys/current",
				"GET /api/v1/openapi.json",
			],
		},
	});
};

export const listEvents = async (req, res, next) => {
	try {
		const events = await eventRepository.findAll({});
		res.json({ success: true, data: events.map(publicEvent) });
	} catch (error) {
		next(error);
	}
};

export const getEvent = async (req, res, next) => {
	try {
		const event = await eventRepository.findById(req.params.id);
		if (!event) throw notFound("Event");
		res.json({ success: true, data: publicEvent(event) });
	} catch (error) {
		next(error);
	}
};

export const listEventProjects = async (req, res, next) => {
	try {
		const event = await eventRepository.findById(req.params.id);
		if (!event) throw notFound("Event");
		// Submitted only. Drafts do not exist as far as this surface knows.
		const projects = (await projectRepository.findByEventId(req.params.id)).filter(
			(p) => p.status === "submitted",
		);
		const { counts } = await voteService.tallyFor(projects.map((p) => p._id), null);
		res.json({
			success: true,
			data: projects.map((p) => publicProject(p, counts.get(p._id.toString()) ?? 0)),
		});
	} catch (error) {
		next(error);
	}
};

export const getProject = async (req, res, next) => {
	try {
		const project = await projectRepository.findById(req.params.id);
		if (!project || project.status !== "submitted") throw notFound("Project");
		const { counts } = await voteService.tallyFor([project._id], null);
		res.json({ success: true, data: publicProject(project, counts.get(project._id.toString()) ?? 0) });
	} catch (error) {
		next(error);
	}
};

export const community = async (req, res, next) => {
	try {
		res.json({ success: true, data: await voteService.summariseVotes(req.params.id) });
	} catch (error) {
		next(error);
	}
};

export const projectComments = async (req, res, next) => {
	try {
		res.json({ success: true, data: await commentService.listForProject(req.params.id) });
	} catch (error) {
		next(error);
	}
};

// --- The embeddable gallery widget (T4) --------------------------------------

/** HTML-escape user text. Everything in the widget is user text. */
const esc = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const cardFor = (p) => {
	const title = p.repoUrl
		? `<a href="${esc(p.repoUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a>`
		: esc(p.title);
	const meta = [p.team, p.track].filter(Boolean).map(esc).join(" · ");
	return `<li class="card">
  <h3>${title}</h3>
  ${p.tagline ? `<p class="tagline">${esc(p.tagline)}</p>` : ""}
  <p class="meta">${meta}${meta ? " · " : ""}▲ ${Number(p.voteCount) || 0}</p>
</li>`;
};

/**
 * A self-contained HTML gallery of the event's submitted entries, made to be
 * put in an iframe on someone else's site. No script, no external asset, no
 * cookie: it is the public gallery, readable, and nothing else. The CSP header
 * explicitly invites framing, which is the whole point of the page.
 */
export const embedGallery = async (req, res, next) => {
	try {
		const event = await eventRepository.findById(req.params.id);
		if (!event) throw notFound("Event");
		const projects = (await projectRepository.findByEventId(req.params.id)).filter(
			(p) => p.status === "submitted",
		);
		const { counts } = await voteService.tallyFor(projects.map((p) => p._id), null);
		const cards = projects
			.map((p) => publicProject(p, counts.get(p._id.toString()) ?? 0))
			.map(cardFor)
			.join("\n");

		const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(event.name)} — gallery</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 12px; font: 14px/1.45 system-ui, sans-serif;
         background: transparent; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { color: #eee; } }
  header { margin-bottom: 10px; }
  h2 { font-size: 16px; margin: 0; }
  .sub { font-size: 12px; opacity: .7; margin: 2px 0 0; }
  ul { list-style: none; margin: 0; padding: 0; display: grid;
       grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
  .card { border: 1px solid rgba(128,128,128,.35); border-radius: 8px; padding: 10px; }
  .card h3 { font-size: 14px; margin: 0 0 4px; }
  .card a { color: inherit; }
  .tagline { margin: 0 0 6px; font-size: 12px; opacity: .85; }
  .meta { margin: 0; font-size: 11px; opacity: .6; }
  footer { margin-top: 10px; font-size: 11px; opacity: .55; }
</style>
</head>
<body>
<header>
  <h2>${esc(event.name)}</h2>
  <p class="sub">${projects.length} submitted ${projects.length === 1 ? "entry" : "entries"}</p>
</header>
<ul>
${cards || "<li>No entries have been submitted yet.</li>"}
</ul>
<footer>Powered by Verdikt</footer>
</body>
</html>`;

		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.setHeader("Content-Security-Policy", "frame-ancestors *");
		res.send(html);
	} catch (error) {
		next(error);
	}
};
