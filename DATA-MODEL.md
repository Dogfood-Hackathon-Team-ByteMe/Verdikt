# Data model

MongoDB via Mongoose. Every collection has `createdAt` / `updatedAt`.

## Collections

### User
| Field | Type | Notes |
|---|---|---|
| `email` | String, unique | Lower-cased on write |
| `password` | String | bcrypt, cost 12. Excluded from every read but `findByEmailWithPassword` |
| `name` | String | |
| `participatingIn` | [ObjectId → Event] | Events this user competes in |
| `judgeIn` | [ObjectId → **Track**] | Tracks, not events |
| `organiserIn` | [ObjectId → Event] | Events this user organises |
| `isAdmin` | Boolean | Global override. Not settable over HTTP — seed or promote in the database |

### Session
| Field | Type | Notes |
|---|---|---|
| `token` | String, unique, indexed | 32 random bytes, hex |
| `userId` | ObjectId → User | |
| `role` | Enum | `visitor` / `participant` / `judge` / `organizer` / `admin`. Coarse hint only |
| `createdAt` | Date | TTL index, 86400s — Mongo reaps expired rows |

### Event
| Field | Type | Notes |
|---|---|---|
| `name`, `description`, `tagline` | String | |
| `organiserId` | ObjectId → User | |
| `judgeIds` | [ObjectId → User] | |
| `tracks` | [ObjectId → Track] | |
| `startsAt` | Date | Drives the before/during/after state |
| `submissionsClose` | Date | The hard deadline, enforced on every project write |
| `prizes` | [Prize] | Subdocument: `name`, `amountUsd`, `description`, `trackId` (null = overall) |
| `customQuestions` | [Question] | Subdocument: `key`, `label`, `type`, `options`, `required` |
| `criteria` | [Criterion] | The scoring rubric. Subdocument: `key`, `label`, `description`, `weight`, `maxScore` |
| `minTeamSize`, `maxTeamSize` | Number | Enforced on invite accept |
| `isFeatured` | Boolean | The event the public landing page shows |
| `eventTags` | [String] | |
| `isJudgeApplyOpen` | Boolean | |

Prizes, custom questions and rubric criteria are subdocuments rather than
collections: none is ever queried independently of its event, and this keeps
"configurable prizes and organizer-defined questions" to a single write.

Criterion weights are **relative, not percentages** — a 3/1/1 rubric ranks
identically to a 60/20/20 one. Each line is scaled to its own `maxScore` before
being weighted, so a rubric can mix a 1–5 line with a 1–10 one without the
longer scale quietly counting for more than its weight says. The weighted score
of a ballot is `sum(score_i / maxScore_i * weight_i) / sum(weight_i)`, which
lands in 0..1 whatever scales are in play (`backend/utils/rubric.js`).

### Track
`topic`, `description`, `eventId`, `judges: [User]`.

Judges are appointed **per track**, and appointing one writes to three places in
a transaction: `Track.judges`, `User.judgeIn` and `Event.judgeIds`. That is why
`isJudgeOf` has to check both the event-level and the track-level list — the two
shapes both mean "judges this event".

### Team
`name`, `description`, `eventId`, `members: [User]`, `projectId`,
`hasMinimumMembers`. **The first member is the leader** — only they can create
invites or delete the project.

### Project
| Field | Type | Spec name |
|---|---|---|
| `title` | String, required | name |
| `tagline` | String | tagline |
| `summary` | String | short blurb on the gallery card |
| `description` | String | long description |
| `thumbnailUrl` | String | thumbnail |
| `galleryUrls` | [String] | image gallery |
| `demoVideoUrl` | String | hosted demo video URL |
| `repoUrl` | String | repository URL (canonical) |
| `codeRepoLink` | String | legacy duplicate of `repoUrl`, mirrored on write |
| `liveUrl` | String | live link |
| `techTags` | [String] | tech tags |
| `trackId` | ObjectId → Track | track selection |
| `customAnswers` | Map<String, String> | keyed by `Event.customQuestions[].key` |
| `teamId`, `eventId` | ObjectId | Server-set, never from the request body |
| `status` | `draft` \| `submitted` | Server-set |
| `submittedAt` | Date | Server-set |

Indexes: `{eventId, status}` and `{trackId, status}` for the gallery.

### Score
`judgeId`, `eventId`, `projectId`, `scores: Map<String, Number>`, `comment`.
Unique index on `{judgeId, projectId}` — one ballot per judge per project.

Normalized scores are never stored: like the ranking, they are derived from
the ballots on every read (`utils/normalization.js`).

`scores` is keyed by `Event.criteria[].key`. Where the event has a rubric, the
API refuses a ballot that names a key the rubric does not define, leaves one of
its criteria unscored, or puts a value outside that criterion's own `0..maxScore`
range. An event with **no** rubric accepts any map of numbers — ballots existed
before rubrics did, and refusing the older shape would make previously-valid
data unwritable.

### Result
`eventId`, `teamId`, `projectId`, `trackId`, `overallPosition`, `trackPosition`,
`details`.

**Not the leaderboard.** This collection is for *published* final standings —
hand-entered positions, for announcing winners once they are decided. The live
ranking is computed from `Score` on every read and never stored
(`backend/utils/standings.js`, `services/StandingsService.js`), because ballots
keep changing until judging closes and a stored ranking would go stale
silently — looking authoritative and being wrong.

An entry's score is the **mean of its ballots'** weighted scores, not the
weighted mean of its per-criterion averages. The two agree when every judge
scored every criterion, which the rubric enforces; going ballot-first means a
partially-filled legacy ballot degrades to one judge's slightly under-informed
opinion instead of skewing a whole criterion's average. Entries with no ballots
are returned with a `null` score and a `null` rank — unjudged, not last. Ties
share a rank and consume the ones behind them (1, 2, 2, 4).

### Assignment
`eventId`, `judgeId`, `projectId`, `source` (`auto` / `manual` / `ballot`),
`createdBy`. Unique index on `{judgeId, projectId}`; indexed by
`{eventId, judgeId}` and `{eventId, projectId}`.

Once an event has any assignments they **are** the judging scope: a judge can
score exactly their assigned entries. `source: ballot` marks an entry adopted
because the judge had already scored it before assignments existed. The rules
for dealing them are in [JUDGING.md](JUDGING.md#2-batch-assignment).

### JudgeInvite
`eventId`, `trackId`, `email` (lower-cased), unique `token`, `createdBy`,
`expiresAt` (14 days), `acceptedAt`, `acceptedBy`, `revokedAt`.

Stricter than a team invite on purpose: bound to one address, single use (the
claim is an atomic `findOneAndUpdate` on `acceptedAt: null`), revocable. Status
(`pending` / `accepted` / `expired` / `revoked`) is computed on read, never
stored, so it cannot go stale.

### Invite / JoinRequest / JudgeApplication / Notification
`Invite`: `teamId`, unique `token`, `createdBy`, `expiresAt` (7 days).
The other three carry a `status` of `pending` / `accepted` / `rejected`.

Every road onto a judging panel -- direct appointment, an accepted
`JudgeApplication`, an accepted `JudgeInvite` -- goes through one function
(`TrackService.appointJudge`), which refuses anyone competing in or organising
the event and writes `Track.judges`, `User.judgeIn` and `Event.judgeIds`
together. Taking a judge off their last track in an event also removes them
from `Event.judgeIds` and drops their unscored assignments.

## Denormalisation, and what it costs

Membership is stored twice on purpose: `Team.members` holds users, and each
`User.participatingIn` holds the event. That makes "is this user in this event?"
a field read instead of a join, which matters because the authorisation layer
asks it on nearly every request.

The cost is that the two can drift. Every operation that changes membership
therefore runs inside a transaction (`utils/transaction.js`), which is why the
bundled Mongo is a single-node replica set. On a standalone mongod those writes
still run, non-atomically, with a warning — the worst case is a stale reference,
not lost user data, but run the replica set for anything real.

## Import and export

- **Export**: `GET /api/export.csv?eventId=<id>` — organizer or admin only. One
  row per criterion per ballot: judge name, judge email, project, team, track,
  criterion, score, comment.
- **Import / seeding**: `backend/scripts/seed.js` (`npm run seed`) builds a
  complete event — 21 users across every role, 4 tracks, 6 prizes, 2 custom
  questions, 8 teams and projects (7 submitted, 1 draft), 8 ballots. It refuses
  to run against a populated database unless `SEED_FORCE=true`, so restarting
  compose does not wipe work.
- **Fixtures**: `backend/scripts/import-fixtures.js` (`npm run import-fixtures`)
  loads the graders' `fixtures.json` as an additional, already-closed event --
  8 tracks, 30 judges, 40 teams, 41 submitted projects, 126 ballots. It clears
  a previous import first, so re-running does not double the gallery, and it
  leaves the seeded event untouched.
- **Images**: avatars, event banners and project thumbnails are uploaded to
  `POST /api/images` (raw bytes, 2 MB cap, type verified by magic number, not
  by the Content-Type header) and stored as a `Buffer` in the `images`
  collection. Records keep only the URL `/api/images/<id>`, so a list of
  projects never carries image bytes. `GET /api/images/:id` is public and
  immutable-cached for a year with an ETag, which is safe because replacing a
  picture mints a new id rather than mutating one.
- **Backup**: everything lives in one Mongo database; `mongodump` is the whole
  backup story — including the images, which is why they are in Mongo and not
  on a second volume.
