# Verdikt

Open, self-hostable hackathon submissions and judging. Built for DOGFOOD 2026.

Verdikt runs an event end to end: people sign up, form teams by invite link,
draft and edit a submission until the deadline, and the public browses a
searchable gallery of what was built. Organizers configure dates, tracks, prizes
and their own submission questions. Judges score; organizers export.

## Run it

```bash
docker compose up
```

Then open **http://localhost:3000**. That is the whole setup: one command, no
cloud account, no API keys, no external sign-in service. It works with the
network cable pulled.

The database seeds itself on first start, so there is a live event with eight
projects and accounts of every role ready to use:

| Account | Role | Password |
|---|---|---|
| `admin@verdikt.dev` | admin | `dogfood2026` |
| `organizer@verdikt.dev` | organizer | `dogfood2026` |
| `judge@verdikt.dev` | judge | `dogfood2026` |
| `participant@verdikt.dev` | participant | `dogfood2026` |

Restarting keeps your data. To wipe and re-seed:
`docker compose run --rm -e SEED_FORCE=true seed`.

## Develop

```bash
# API  (needs a MongoDB replica set; see below)
cd backend && npm install && npm run dev      # :8080

# Web
cd Frontend && npm install && npm run dev     # :5173
```

Copy `backend/.env.example` to `backend/.env`. For the frontend, set
`VITE_API_URL=http://localhost:8080` in `Frontend/.env`; leave it empty to run
the UI on built-in sample data with no backend at all.

The API needs Mongo as a **replica set**, because several operations use
multi-document transactions. Easiest is to borrow the bundled one:
`docker compose up mongo`. A standalone mongod also works — those writes fall
back to non-atomic with a warning.

## Test

```bash
cd backend
npm test              # 99 tests
npm run acceptance    # same, and writes ../acceptance-report.txt
```

### The graders' checker

```bash
cd backend
npm run import-fixtures     # loads ../fixtures.json into the portal
npm run dogfood-config      # writes [portal]/[auth]/[routes] into .dogfood.toml
cd .. && python run.py .dogfood.toml
```

`fixtures.json` is a second, already-closed event, so `run.py` can check a real
deadline refusal rather than take one on trust. The session cookies
`dogfood-config` writes last 24 hours; re-run it before a grading pass.

The suite starts a throwaway in-memory MongoDB replica set and drives the real
Express app over HTTP. Nothing calls a service directly, because what is being
checked is that the **API** enforces the rules — T1 requires role restrictions
"at the API level, not just the UI".

## What is done

**Tier 1: complete.** Authentication and sessions; the five-role model;
event creation with configurable dates, tracks, prizes and custom questions;
team formation by invite link; draft-and-edit submissions; deadline enforcement
that actually refuses writes; a public searchable, filterable gallery; and
role checks enforced server-side. `acceptance-report.txt` is the receipt.

**Tier 2: partial, and not claimed.** Scoring, one-ballot-per-judge-per-project,
judge isolation (a judge only ever reads their own ballots) and CSV export all
exist. The weighted organizer-configurable rubric, judge assignment, the live
organizer dashboard and cross-judge normalization do not.

**Tier 3: not started.**

## Honest limits

- **No rate limiting.** Login is brute-forceable. This is the first thing to add
  before anyone runs a real event on it.
- **Seed passwords are shared and printed to the log.** Fine for a demo; change
  `SEED_PASSWORD` for anything else.
- **No email.** Invites are links you share yourself.
- **`isAdmin` is not settable over HTTP** by design — promote in the database.
- **Frontend auth screens run on a mock adapter** until `VITE_API_URL` is set;
  the real client is written and switches with that one variable.
- Cross-judge normalization is unimplemented, so `JUDGING.md` is deliberately
  absent rather than aspirational.

## Layout

```
backend/      Express API: routes -> controllers -> services -> repositories
  tests/      HTTP-level acceptance suite
  scripts/    seed.js
Frontend/     React + Vite SPA (landing page, auth, UI kit)
docker-compose.yml
ARCHITECTURE.md   system design and why
DATA-MODEL.md     schema, indexes, import/export
acceptance-report.txt
```

MIT licensed. 
