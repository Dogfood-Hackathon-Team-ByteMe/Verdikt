# Architecture

Verdikt is a hackathon submission and judging portal. Three containers, no
cloud services, no external identity provider: `docker compose up` gives you
the whole thing on a laptop with the network off.

```
browser
   |
   |  http://localhost:3000
   v
[ web ]  nginx: serves the built SPA, proxies /api -> api:8080
   |
   |  same origin, so the session cookie is same-site
   v
[ api ]  Express 4 on Node 22
   |
   v
[ mongo ] MongoDB 7, single-node replica set
```

## Why these choices

**Same-origin proxy rather than CORS.** The web container proxies `/api` to the
API instead of the browser calling `:8080` directly. The session cookie is
`httpOnly; SameSite=Lax`, and keeping everything on one origin means no
preflight, no `SameSite=None`, and no HTTPS requirement for local use. The API
still sets permissive-but-explicit CORS headers (`CORS_ORIGIN`) so you can point
a Vite dev server at it during development.

**Server-side sessions, not JWT.** A session is 32 random bytes stored in Mongo
with a 24-hour TTL index. Signing out deletes the row, so a captured token dies
immediately. A JWT would have been fewer moving parts but could not be revoked,
and "judges never see peer ballots" is easier to defend when the server can
retract access mid-event.

**Single-node replica set, not standalone Mongo.** Several operations write a
document plus a denormalised pointer to it (create a team, and the user's
`participatingIn` must gain the event). Those run in a transaction, and MongoDB
only offers transactions on a replica set. One node gives that without a
cluster. `utils/transaction.js` degrades to non-transactional writes with a
warning if it finds a standalone, so a contributor pointing `MONGO_URI` at a
plain local mongod is not blocked.

## Layering

Requests flow through four layers, each with one job:

| Layer | Responsibility | Example |
|---|---|---|
| `routes/` | URL shape, HTTP method, which middleware runs | `projectRoutes.js` |
| `controllers/` | Read the request, call a service, shape the response | `ProjectController.js` |
| `services/` | Business rules and **all** authorisation | `ProjectService.js` |
| `repositories/` | Database queries, population, projection | `ProjectRepository.js` |

**Authorisation lives in the service layer, never in routes.** T1 requires role
checks that "survive backend verification, not just hide UI buttons", and a
check attached to a route only protects that one route. Putting it in the
service means every caller inherits it. `ProjectService.updateProject` refuses a
non-member whether it was reached through `PUT /api/projects/:id`, a future
bulk-edit endpoint, or a script.

Every response is `{ success, data, message }`. Errors carry a `statusCode` on a
plain `Error`; `middlewares/errorHandler.js` maps Mongoose `ValidationError`,
`CastError` and duplicate-key errors to 400/400/409, logs only 5xx, and never
echoes an internal exception message on a 500.

## The role model

Roles are **per event**, not global. The same person can organise one event,
judge a track in a second and compete in a third, so `User` carries three arrays
rather than one role field:

- `organiserIn: [Event]`
- `judgeIn: [Track]` — tracks, not events
- `participatingIn: [Event]`
- `isAdmin: Boolean` — global override, not settable over HTTP

`isAdmin` is the only thing anyone is *everywhere*. Every other word is a
relationship to one event, so running your own hackathon and entering someone
else's are the same account doing two unrelated things.

`Session.role` stores a single coarse value for UI chrome only -- it is derived
from those arrays and says nothing about the event in front of you, so it picks
a menu and never a permission. Anything that gates access asks
`utils/eventRoles.js` about the specific event instead. That module is the one
place the rules live:

- `isOrganiserOf(user, eventId)` / `isJudgeOf(user, event)` -- per-event, and
  `isJudgeOf` accepts both shapes a judge comes in: `event.judgeIds` holds user
  ids, `user.judgeIn` holds track ids.
- `assertCanParticipate(user, event)` -- **you cannot compete in an event you
  run or judge, and admins compete nowhere.** Every road into a team goes
  through it (invite link, join request, team creation, direct add, accepting a
  request), because a check on one route protects only that route.

Note the spelling split, which is easy to trip over: the Session enum uses
American `organizer`, the User field is British `organiserIn`.

## Request lifecycle for an authenticated call

1. `authenticate` parses the `session` cookie, looks up the Session, and
   populates `req.user` (with `-password`). No cookie means `req.user = null` —
   not an error.
2. `requireAuth` turns a null user into 401. Public routes omit it, which is how
   the gallery recognises a signed-in team member while still serving visitors.
3. The controller calls a service with `req.user`.
4. The service decides. It throws `Object.assign(new Error(msg), { statusCode })`.

The gallery is the clearest case: `GET /api/projects` runs `authenticate` but
not `requireAuth`, so an anonymous visitor sees submitted projects, a team
member additionally sees their own drafts, and an organiser sees every draft in
their event — one endpoint, three answers, decided server-side.

## Testing

`backend/tests/` drives the real Express app over HTTP against a throwaway
in-memory MongoDB replica set. No test calls a service directly, because the
thing being verified is precisely that the API enforces the rules. 255 tests in
nine suites; `npm run acceptance` writes `acceptance-report.txt`.

## Known limits

- Rate limit counters are in memory, so they reset with the process and are
  not shared between processes. Correct for the single API container this
  ships as; a multi-process deployment needs a shared store first.
- The seed password is shared across demo accounts and printed to the log. Fine
  for a seeded demo, not for anything real.
- No email delivery, so invites are shareable links rather than sent messages.

## Anti-abuse and the audit trail

Two middlewares and one collection, in `middlewares/rateLimit.js`,
`services/AuditService.js` and `models/AuditLog.js`.

Who a request is counted against matters more than the ceiling it is counted
towards. Sign-in is counted twice: a tight bucket per email address that only
failures fill, and a looser one per address. Counting by address alone would
let one attacker on a shared connection lock out everyone behind it; counting
by account alone would miss someone spraying a single guess across a thousand
accounts. A successful sign-in clears the account's bucket, so a user who
mistypes twice and then remembers carries nothing forward.

All of that depends on `req.ip` being the caller rather than nginx, which is
why `app.js` sets `trust proxy`. Trusting exactly one hop also means a client
that sends its own `X-Forwarded-For` cannot shift the blame, because the
address Express reads is the one nginx appended, not the one the client
supplied.

The audit trail answers the question a disputed result actually raises, which
is usually not "what did that judge score" but "why was that person judging at
all". Every change to a panel is recorded with its actor, and there is no
update or delete path anywhere: a log you can edit answers nothing. Writes
never throw -- an audit failure must not roll back the action it describes --
so the trail can have holes, and they are logged rather than hidden.

An organiser reads their own event's trail; a judge is refused, because it
names every other judge and the order they arrived in.

## The community layer

Votes (`models/Vote.js`, `services/VoteService.js`) live in their own
collection, nowhere near `Score`, and nothing in `utils/standings.js` knows
they exist -- that is the whole design. The crowd's ranking and the judges'
ranking are published side by side and can disagree in the open; there is no
code path by which one leaks into the other. One vote per person per project is
a unique index, not a request-path check a race could slip past, and the
people who run the official ranking -- the event's organiser, its judges,
admins -- cannot vote at all, along with the project's own team.

Comments (`models/Comment.js`, `services/CommentService.js`) are public to
read, one reply level deep, and removal never deletes the row: the body is
blanked at read time and the placeholder says whether the author or the
organiser did it, so threads keep their shape and moderation stays visible.
Organiser removals land in the audit trail; an author taking back their own
words does not, because that is not an exercise of power over anyone else.

The public API (`routes/v1Routes.js`, `controllers/PublicApiController.js`,
documented in [API.md](API.md)) is GET-only, keyless and rate-limited per
address. Its serializers are allow-lists: a field a response does not name
does not exist on this surface, which is how drafts, team rosters and email
addresses stay unpublishable by accident rather than by vigilance.

## Judging

How ballots become a ranking -- the rubric arithmetic, batch assignment, what
each judge may see and score, cross-judge normalization and the simulation that
measures it -- is its own document: [JUDGING.md](JUDGING.md). The short version
of the architecture: scope rules live in one place (`services/JudgeScope.js`)
and are applied both where ballots are written and where the judge's queue is
read, so the page cannot offer an entry the API would refuse; and standings are
computed from ballots on every read, never stored.
