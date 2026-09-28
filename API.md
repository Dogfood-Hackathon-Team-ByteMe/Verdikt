# The public API

`/api/v1` is Verdikt's read-only public surface: the gallery, the events, the
community poll and the comments, as JSON, for anything that isn't the bundled
frontend — a leaderboard on a venue screen, a bot posting new submissions to a
chat channel, a site embedding the gallery.

```
curl http://localhost:3000/api/v1/events
```

## The three promises

1. **GET only, no account.** Nothing on this surface mutates and nothing needs
   a cookie or key. Any other verb is a 404.
2. **Every field is public on purpose.** Responses are built from allow-lists,
   not from the database models. Drafts do not exist here (they 404
   indistinguishably from missing ids), team rosters and email addresses never
   appear, and a new model field stays private until someone adds it to a
   serializer by hand.
3. **v1 is stable.** Fields may be added over time; renaming or removing one
   means a `/api/v2`, not a quiet break.

Being keyless, the surface is rate-limited per address — 120 requests a minute
by default (`RATE_LIMIT_PUBLIC` to change it). Past the ceiling you get a
`429` with a `Retry-After` header saying how many seconds to wait.

Every response has the same envelope as the rest of Verdikt:

```json
{ "success": true, "data": ... }
```

## Endpoints

### `GET /api/v1`

The index: version number and the endpoint list. The surface describes itself.

### `GET /api/v1/events`

Every event, public fields only.

```json
{
  "success": true,
  "data": [
    {
      "id": "6ab919024094777524ec2030",
      "name": "Sample Hack 2026",
      "tagline": "Imported from fixtures.json",
      "description": "…",
      "startsAt": "2026-09-01T09:00:00.000Z",
      "submissionsClose": "2026-09-28T00:00:00.000Z",
      "tracks": [{ "id": "…", "name": "Developer tools" }],
      "prizes": [{ "name": "Grand prize", "amountUsd": 5000, "description": null }]
    }
  ]
}
```

Judges, the organiser and the custom question set are not in the response.

### `GET /api/v1/events/:id`

One event, same shape. Unknown id → `404`.

### `GET /api/v1/events/:id/projects`

The event's **submitted** entries, newest first, each with its community vote
count. Drafts are absent, and so is everything about the team beyond its name:

```json
{
  "id": "…",
  "title": "Quorum",
  "tagline": null,
  "summary": "Pairwise judging engine.",
  "description": null,
  "repoUrl": "https://github.com/example/quorum",
  "liveUrl": null,
  "demoVideoUrl": null,
  "thumbnailUrl": null,
  "techTags": ["Go", "Postgres"],
  "team": "Null Island",
  "track": "Developer tools",
  "submittedAt": "2026-09-27T14:02:11.512Z",
  "voteCount": 3
}
```

### `GET /api/v1/projects/:id`

One submitted project, same shape. A draft answers `404`, exactly like a
missing id, so this endpoint cannot be used to probe for unsubmitted work.

### `GET /api/v1/events/:id/community`

The community poll: submitted projects ranked by votes, competition ranking on
ties (1, 1, 3). This is the endpoint to poll for a venue screen.

```json
{
  "eventId": "…",
  "totalVotes": 12,
  "standings": [
    { "rank": 1, "projectId": "…", "title": "Quorum", "teamName": "Null Island",
      "track": "Developer tools", "voteCount": 7 }
  ]
}
```

The poll is the crowd's pick and only that: community votes never reach the
judged standings, which live behind the organiser's session on the private API.
How the judged ranking is computed is written down in [JUDGING.md](JUDGING.md).

### `GET /api/v1/projects/:id/comments`

The project's public comment thread, oldest first. A removed comment keeps its
slot with a placeholder body and a `removed: true` flag, so replies still have
their parent.

## What is deliberately NOT here

- **Standings and ballots.** The judged ranking, per-judge scores and exports
  stay behind the organiser's session. Community counts are the only numbers
  this surface publishes.
- **Writes.** Voting and commenting require an account and go through the
  private API with its per-account limits.
- **People.** No emails, no rosters, no judge lists — names appear only where
  their owner published them (a team's name, a comment author's display name).
