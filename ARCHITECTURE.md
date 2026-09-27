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

`Session.role` stores a single coarse value for UI chrome only. Anything that
gates access re-derives the answer for the specific event in the service layer.
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
thing being verified is precisely that the API enforces the rules. 84 tests in
four suites; `npm run acceptance` writes `acceptance-report.txt`.

## Known limits

- Rate limiting is not implemented. Login is brute-forceable. T3 asks for
  anti-abuse; this is where it would go.
- The seed password is shared across demo accounts and printed to the log. Fine
  for a seeded demo, not for anything real.
- No email delivery, so invites are shareable links rather than sent messages.
- Cross-judge normalization and the weighted rubric are T2, and are not claimed.
