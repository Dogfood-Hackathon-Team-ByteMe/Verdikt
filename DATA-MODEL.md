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
| `minTeamSize`, `maxTeamSize` | Number | Enforced on invite accept |
| `isFeatured` | Boolean | The event the public landing page shows |
| `eventTags` | [String] | |
| `isJudgeApplyOpen` | Boolean | |

Prizes and custom questions are subdocuments rather than collections: neither is
ever queried independently of its event, and this keeps "configurable prizes and
organizer-defined questions" to a single write.

### Track
`topic`, `description`, `eventId`, `judges: [User]`.

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

### Result
`eventId`, `teamId`, `projectId`, `trackId`, `overallPosition`, `trackPosition`,
`details`.

### Invite / JoinRequest / JudgeApplication / Notification
`Invite`: `teamId`, unique `token`, `createdBy`, `expiresAt` (7 days).
The other three carry a `status` of `pending` / `accepted` / `rejected`.

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
