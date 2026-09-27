<div align="center">

# Verdikt

**Open-source hackathon platform for submissions, teams and judging — self-hosted, no cloud account required.**

Spin up a complete hackathon portal — registration, team formation, project
submissions and judging — with one command and zero external services.

[Quick start](#quick-start) · [What it does](#what-it-does) · [Test it](#test-it) · [Architecture](#architecture) · [Honest limits](#honest-limits)

</div>

---

## Why Verdikt

Most hackathon tooling is a spreadsheet, a Google Form, and a Discord bot
duct-taped together — or a SaaS product that wants your organiser's card
number and a support ticket to export a CSV. Verdikt is neither: it's a
self-hostable hackathon management system that runs an event end to end —
**sign-up, team formation, project submission, and judging** — as one
`docker compose up`, on a laptop, with the network cable pulled if you want.

No cloud account. No API keys. No third-party identity provider. No vendor
lock-in on your event's data — it's one MongoDB database, and `mongodump` is
the entire backup story.

**Roles are per event, not global.** The same account can organise one
hackathon, judge a track in a second, and compete in a third — because that's
how real hackathon circuits actually work, and no platform we looked at
modelled it that way.

## What it does

- **Accounts and sessions** — email/password auth, httpOnly session cookies,
  no third-party identity provider to configure or trust.
- **Any signed-in user can organise an event.** Configure dates, tracks,
  prizes, minimum/maximum team size, and your own custom submission
  questions (required or optional, per event).
- **Team formation by invite link** — no admin approval queue, no email
  service required to run an event.
- **Draft-and-edit submissions** until the deadline, enforced server-side —
  not just hidden behind a disabled button in the UI.
- **A public, searchable, filterable project gallery** — no account needed
  to browse what was built.
- **Judging** — one ballot per judge per project, judge isolation (a judge
  can only ever read their own scores, never a peer's), and CSV export of
  every ballot for the organiser.
- **Image uploads for avatars, event banners and project thumbnails** —
  with an in-browser crop step, so what you frame while uploading is
  exactly what gets shown everywhere, and stored inline in the same
  database as everything else (no S3 bucket, no second backup story).

## Quick start

```bash
git clone <this-repo>
cd verdikt
docker compose up
```

Open **http://localhost:3000**. That's the whole setup.

The database seeds itself on first boot with a live sample event and one
account per role:

| Account | Role | Password |
|---|---|---|
| `admin@verdikt.dev` | admin | `dogfood2026` |
| `organizer@verdikt.dev` | organizer | `dogfood2026` |
| `judge@verdikt.dev` | judge | `dogfood2026` |
| `participant@verdikt.dev` | participant | `dogfood2026` |

Restarting the stack keeps your data. To wipe and re-seed:

```bash
docker compose run --rm -e SEED_FORCE=true seed
```

## Local development

```bash
# API — needs a MongoDB replica set; see below
cd backend && npm install && npm run dev      # :8080

# Web
cd Frontend && npm install && npm run dev     # :5173
```

Copy `backend/.env.example` to `backend/.env`. For the frontend, set
`VITE_API_URL=http://localhost:8080` in `Frontend/.env`; leave it unset to
run the UI on built-in sample data with no backend running at all.

The API needs Mongo as a **replica set** — several operations use
multi-document transactions to keep team, project and score writes
consistent. Easiest path: borrow the bundled one with
`docker compose up mongo`. A standalone `mongod` also works; those specific
writes fall back to non-atomic with a logged warning.

## Test it

```bash
cd backend
npm test              # 99 tests, one throwaway in-memory Mongo replica set
npm run acceptance    # same suite, writes ../acceptance-report.txt
```

Every test drives the real Express app over HTTP — nothing calls a service
function directly. What's being checked is that the **API** enforces every
rule, not just the UI: role restrictions, deadline enforcement, judge
isolation and permission checks all hold even if you skip the frontend
entirely and hit the endpoints with curl.

### Independent acceptance check

```bash
cd backend
npm run import-fixtures     # loads a second, already-closed sample event
npm run dogfood-config      # mints session cookies into a local config file
cd .. && python run.py .dogfood.toml
```

The imported event has a deadline in the past, so submission refusal is
verified against real, closed data — not asserted on trust.

## What's implemented

**Core (submissions and judging): complete.** Authentication and sessions;
per-event roles (organiser / judge / participant, plus a single global
admin override); event creation with configurable dates, tracks, prizes and
custom questions; team formation by invite link; draft-and-edit submissions;
deadline enforcement that actually refuses writes at the API layer; a
public searchable, filterable gallery; image uploads with in-browser
cropping; and role checks enforced server-side, not just hidden in the UI.
`acceptance-report.txt` is the receipt — every claim above has a passing
test behind it.

**Judging extras: partial.** One-ballot-per-judge-per-project, judge
isolation, and CSV export all exist and are tested. A weighted,
organiser-configurable rubric, judge-to-track assignment tooling, a live
organiser scoring dashboard, and cross-judge score normalization do not
exist yet.

## Honest limits

Underclaiming beats overclaiming, so here's what's genuinely missing —
read this before you deploy it anywhere real:

- **No rate limiting.** Login is brute-forceable as shipped. This is the
  first thing to add before running a real event on it.
- **Seed passwords are shared and printed to the log.** Fine for a demo.
  Set `SEED_PASSWORD` to something else for anything real.
- **No email service.** Invites are links you copy and share yourself.
- **`isAdmin` is not settable over HTTP**, by design — promote a user to
  admin directly in the database.
- **Cross-judge score normalization is unimplemented** — scores are raw
  per-judge ballots, not normalized against each judge's own scoring
  tendencies.

## Architecture

Three containers, no managed cloud services:

```
browser → nginx (serves the SPA, proxies /api) → Express API → MongoDB (single-node replica set)
```

Same-origin by design: the web container proxies `/api` to the backend
instead of the browser calling it cross-origin, so the session cookie stays
`httpOnly; SameSite=Lax` with no CORS preflight and no HTTPS requirement
for local use.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full request lifecycle,
the per-event role model, and the reasoning behind every non-obvious
decision. See **[DATA-MODEL.md](DATA-MODEL.md)** for the schema, indexes,
and import/export format.

## Project layout

```
backend/          Express API — routes → controllers → services → repositories
  tests/          HTTP-level acceptance suite (99 tests)
  scripts/        seed.js, import-fixtures.js, dogfood-config.js
Frontend/         React + Vite single-page app
docker-compose.yml
ARCHITECTURE.md    System design and the reasoning behind it
DATA-MODEL.md      Schema, indexes, import/export
acceptance-report.txt
```

## License

MIT. Fork it, self-host it, run your own hackathon on it.
