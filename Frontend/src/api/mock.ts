/**
 * Browser-only implementation of VerdiktApi.
 *
 * Used whenever VITE_API_URL is unset, so the whole app -- including the
 * signed-in screens -- can be built and demoed with no backend running. State
 * is held in module memory and mutates, so creating a team then submitting a
 * project behaves like the real thing within a session (a refresh resets it).
 *
 * Paired with mockAuth.ts, which owns the session side.
 */
import type { VerdiktApi } from './client'
import type {
  Assignment,
  Ballot,
  EventDraft,
  HackEvent,
  Invite,
  AuditEntry,
  JudgeApplication,
  ProjectComment,
  JudgeInvite,
  Notification,
  PlatformStats,
  Project,
  ProjectDraft,
  ProjectQuery,
  StandingRow,
  Standings,
  Team,
  Track,
  Certificate,
  Webhook,
  WebhookDelivery,
} from './types'
import { ApiError } from './unwrap'

const EVENT_ID = 'dogfood-2026'

export const mockEvent: HackEvent = {
  id: EVENT_ID,
  name: 'DOGFOOD 2026',
  tagline: 'Build the platform that will judge you.',
  description: 'Build a hackathon hosting and judging platform. The platform you build is the platform you are judged on.',
  starts_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
  // Always ~2 days out, so the countdown is live whenever someone opens this.
  submissions_close: new Date(Date.now() + 48 * 3600_000).toISOString(),
  tracks: [
    { id: 'judging', name: 'Judging Engines', judges: [] },
    { id: 'devtools', name: 'Developer Tools', judges: [] },
    { id: 'infra', name: 'Infrastructure', judges: [] },
    { id: 'security', name: 'Security', judges: [] },
    { id: 'data', name: 'Data & ML', judges: [] },
    { id: 'civic', name: 'Civic Tech', judges: [] },
    { id: 'edu', name: 'Education', judges: [] },
    { id: 'oss', name: 'Open Source Health', judges: [] },
  ],
  prizes: [
    { id: 'p1', name: 'Grand Prize', amount_usd: 800 },
    { id: 'p2', name: 'Runner-Up', amount_usd: 500 },
    { id: 'p3', name: 'Third Place', amount_usd: 350 },
    { id: 'p4', name: 'Fourth Place', amount_usd: 200 },
    { id: 'p5', name: 'Fifth Place', amount_usd: 150 },
    { id: 'p6', name: 'Best Judging Engine', amount_usd: 100, track: 'judging' },
  ],
  custom_questions: [
    { key: 'whatsHard', label: 'What was the hardest part?', type: 'longtext', required: true },
    { key: 'nextStep', label: 'What would you build next?', type: 'longtext', required: false },
  ],
  criteria: [
    { key: 'impact', label: 'Impact', description: 'Does it matter to anyone outside the room?', weight: 3, max_score: 5 },
    { key: 'craft', label: 'Craft', description: 'Is it well built and does it hold up?', weight: 2, max_score: 5 },
    { key: 'originality', label: 'Originality', description: 'Has this been done already?', weight: 2, max_score: 5 },
    { key: 'demo', label: 'Demo', description: 'Does the demo show the thing working?', weight: 1, max_score: 5 },
  ],
  min_team_size: 1,
  max_team_size: 4,
  // No judges in the sample data, so nothing is barred from entering it.
  judge_ids: [],
  judge_apply_open: true,
}

/** Shorthand for the sample rows below. */
const project = (
  id: string,
  team: string,
  track: string,
  title: string,
  tagline: string,
  summary: string,
  tags: string[],
  hoursAgo: number | null,
): Project => ({
  id,
  team,
  team_id: `team-${id}`,
  track,
  track_name: mockEvent.tracks.find((t) => t.id === track)?.name,
  event_id: EVENT_ID,
  title,
  tagline,
  summary,
  description: `${summary}\n\nBuilt during DOGFOOD 2026.`,
  gallery_urls: [],
  repo_url: `https://github.com/example/${id}`,
  live_url: `https://${id}.example.com`,
  tags,
  custom_answers: {},
  status: hoursAgo === null ? 'draft' : 'submitted',
  submitted_at: hoursAgo === null ? null : new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
  // A little sample applause, deterministic from the id so reloads agree.
  vote_count: hoursAgo === null ? 0 : (id.length * 7) % 23,
  has_voted: false,
})

let projects: Project[] = [
  project('quorum', 'Null Island', 'judging', 'Quorum', 'Pairwise judging with a replayable audit log', 'Bradley-Terry ranking over pairwise comparisons, with every comparison replayable.', ['Go', 'Postgres'], 2),
  project('diffscope', 'Late Binding', 'devtools', 'Diffscope', 'Reviews PRs by blast radius, not line count', 'Ranks review urgency by what a change can break.', ['Rust', 'CLI'], 5),
  project('kettle', 'Cold Start', 'infra', 'Kettle', 'A full staging stack from one compose file', 'Boots seeded infrastructure with no cloud account.', ['Docker', 'Nix'], 8),
  project('tripwire', 'Salted', 'security', 'Tripwire', 'Rate limits and a tamper-evident audit trail', 'Duplicate detection for public voting.', ['Python', 'Redis'], 11),
  project('zscore-zoo', 'Overfit', 'data', 'Z-Score Zoo', 'Five normalization methods, side by side', 'Shows how each moves a leaderboard, judge by judge.', ['TypeScript', 'D3'], 14),
  project('open-ballot', 'Ward 9', 'civic', 'Open Ballot', 'Quadratic voting for neighbourhood budgets', 'Email-gated identity with a public tally.', ['Elixir', 'Phoenix'], null),
  project('rubricist', 'Chalkdust', 'edu', 'Rubricist', 'Write a weighted rubric once, reuse it everywhere', 'Teachers reuse rubrics across every class project.', ['Django', 'HTMX'], 20),
  project('maintainer-weather', 'Bus Factor 1', 'oss', 'Maintainer Weather', 'Forecasts dependencies about to lose their only maintainer', 'Reads contribution decay across your dependency tree.', ['Go', 'GraphQL'], 23),
  project('blindfold', 'Tabula', 'judging', 'Blindfold', 'Disjoint judge batches, enforced in the database', 'Nobody ever sees a peer ballot.', ['Rails', 'Postgres'], 26),
  project('seedling', 'Off By One', 'devtools', 'Seedling', 'Fixture data with the edge cases your tests forgot', 'Generates realistic fixtures from a schema.', ['Python'], 29),
  project('offline-first', 'Airgap', 'infra', 'Offline First', 'Proves an app runs with the cable pulled', 'Fails the build when a hidden network call sneaks in.', ['Bash', 'Docker'], 32),
  project('signet', 'Hash Brown', 'security', 'Signet', 'Publicly verifiable proof a judge reviewed a project', 'Ed25519 receipts for every completed ballot.', ['Rust', 'Ed25519'], 35),
]

let teams: Team[] = projects.map((p) => ({
  id: p.team_id,
  name: p.team,
  event_id: EVENT_ID,
  members: [{ id: `member-${p.id}`, name: p.team, email: `${p.id}@example.com` }],
  leader_id: `member-${p.id}`,
  project_id: p.id,
}))

let invites: Invite[] = []
let notifications: Notification[] = []
let ballots: Ballot[] = []
let assignments: Assignment[] = []
let judgeInvites: JudgeInvite[] = []

/** Applications the mock organizer has received. Starts empty. */
let judgeApplications: JudgeApplication[] = []

/** Comments people leave in the mock. Starts empty. */
let comments: ProjectComment[] = []
let nextId = 1

const delay = <T,>(value: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(value), ms))

/** The mock is not a security boundary; it only needs to be shaped right. */
export const mockApi: VerdiktApi = {
  getFeaturedEvent: () => delay(mockEvent),
  listEvents: () => delay([mockEvent]),
  listTracks: () => delay(mockEvent.tracks),

  listProjects: ({ q, track, status }: ProjectQuery = {}) => {
    const needle = q?.trim().toLowerCase()
    const rows = projects.filter(
      (p) =>
        (!track || p.track === track) &&
        (!status || p.status === status) &&
        (!needle ||
          [p.title, p.tagline ?? '', p.summary, p.team, ...p.tags].some((s) => s.toLowerCase().includes(needle))),
    )
    return delay(rows, 120)
  },

  getProject: (id) => delay(projects.find((p) => p.id === id) ?? null),

  listTeams: () => delay(teams),
  getTeam: (id) => delay(teams.find((t) => t.id === id) ?? null),

  getStats: (): Promise<PlatformStats> =>
    delay({ events: 1, projects: projects.length, judges: 36, teams: teams.length }),

  createTeam: ({ name, description, event_id }) => {
    const team: Team = {
      id: `team-new-${nextId++}`,
      name,
      description,
      event_id,
      members: [{ id: 'usr-participant', name: 'You', email: 'participant@verdikt.dev' }],
      leader_id: 'usr-participant',
      project_id: null,
    }
    teams = [...teams, team]
    return delay(team)
  },

  updateTeam: (id, input) => {
    const team = teams.find((t) => t.id === id)
    if (!team) return Promise.reject(new ApiError('Team not found', 404))
    Object.assign(team, input)
    return delay(team)
  },

  removeMember: (teamId, userId) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return Promise.reject(new ApiError('Team not found', 404))
    team.members = team.members.filter((m) => m.id !== userId)
    return delay(team)
  },

  createInvite: (teamId) => {
    const team = teams.find((t) => t.id === teamId)
    const invite: Invite = {
      id: `inv-${nextId++}`,
      token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      team_id: teamId,
      team_name: team?.name,
      expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    }
    invites = [...invites, invite]
    return delay(invite)
  },

  getInvite: (token) => {
    const invite = invites.find((i) => i.token === token)
    if (!invite) return Promise.reject(new ApiError('Invalid invite link', 404))
    return delay(invite)
  },

  acceptInvite: (token) => {
    const invite = invites.find((i) => i.token === token)
    if (!invite) return Promise.reject(new ApiError('Invalid invite link', 404))
    const team = teams.find((t) => t.id === invite.team_id)
    if (!team) return Promise.reject(new ApiError('Team not found', 404))
    if (team.members.some((m) => m.id === 'usr-participant')) {
      return Promise.reject(new ApiError('You are already a member of this team', 409))
    }
    team.members = [...team.members, { id: 'usr-participant', name: 'You', email: 'participant@verdikt.dev' }]
    return delay(team)
  },

  createProject: ({ team_id, ...draft }) => {
    const team = teams.find((t) => t.id === team_id)
    const created: Project = {
      id: `prj-new-${nextId++}`,
      team: team?.name ?? 'Your team',
      team_id,
      track: draft.track ?? '',
      track_name: mockEvent.tracks.find((t) => t.id === draft.track)?.name,
      event_id: EVENT_ID,
      title: draft.title ?? 'Untitled',
      tagline: draft.tagline,
      summary: draft.summary ?? '',
      description: draft.description,
      thumbnail_url: draft.thumbnail_url,
      gallery_urls: draft.gallery_urls ?? [],
      demo_video_url: draft.demo_video_url,
      repo_url: draft.repo_url ?? '',
      live_url: draft.live_url,
      tags: draft.tags ?? [],
      custom_answers: draft.custom_answers ?? {},
      status: 'draft',
      submitted_at: null,
      vote_count: 0,
      has_voted: false,
    }
    projects = [created, ...projects]
    if (team) team.project_id = created.id
    return delay(created)
  },

  updateProject: (id, draft: ProjectDraft) => {
    const found = projects.find((p) => p.id === id)
    if (!found) return Promise.reject(new ApiError('Project not found', 404))
    Object.assign(found, {
      ...draft,
      track: draft.track ?? found.track,
      track_name: mockEvent.tracks.find((t) => t.id === (draft.track ?? found.track))?.name,
    })
    return delay(found)
  },

  submitProject: (id) => {
    const found = projects.find((p) => p.id === id)
    if (!found) return Promise.reject(new ApiError('Project not found', 404))
    // Mirror the server's pre-submit checks so the UI is exercised honestly.
    if (!found.track) return Promise.reject(new ApiError('Pick a track before submitting', 400))
    if (!found.repo_url) return Promise.reject(new ApiError('A repository URL is required before submitting', 400))
    for (const question of mockEvent.custom_questions) {
      if (question.required && !found.custom_answers[question.key]?.trim()) {
        return Promise.reject(new ApiError(`Answer required: ${question.label}`, 400))
      }
    }
    found.status = 'submitted'
    found.submitted_at = new Date().toISOString()
    return delay(found)
  },

  unsubmitProject: (id) => {
    const found = projects.find((p) => p.id === id)
    if (!found) return Promise.reject(new ApiError('Project not found', 404))
    found.status = 'draft'
    found.submitted_at = null
    return delay(found)
  },

  leaveTeam: (teamId, userId) => {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return Promise.reject(new ApiError('Team not found', 404))
    if (team.leader_id === userId) {
      return Promise.reject(new ApiError('The team leader cannot leave. Delete the team instead.', 400))
    }
    team.members = team.members.filter((m) => m.id !== userId)
    return delay(team)
  },

  deleteProject: (id) => {
    projects = projects.filter((p) => p.id !== id)
    for (const t of teams) if (t.project_id === id) t.project_id = null
    return delay(undefined)
  },

  // --- Organizer ----------------------------------------------------------
  listMyEvents: () => delay([mockEvent]),
  getEvent: (id) => delay(id === mockEvent.id ? mockEvent : null),

  createEvent: (input) => {
    // The mock runs one event, so creating returns a copy rather than growing
    // a list the rest of the mock does not model.
    const created: HackEvent = {
      ...mockEvent,
      id: `evt-${nextId++}`,
      name: input.name,
      description: input.description,
      tagline: input.tagline,
      submissions_close: input.submissions_close,
      starts_at: input.starts_at ?? new Date().toISOString(),
      prizes: [],
      custom_questions: [],
      criteria: [],
      tracks: [],
    }
    return delay(created)
  },

  updateEvent: (_id, input: EventDraft) => {
    Object.assign(mockEvent, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.starts_at !== undefined ? { starts_at: input.starts_at } : {}),
      ...(input.submissions_close !== undefined ? { submissions_close: input.submissions_close } : {}),
      ...(input.min_team_size !== undefined ? { min_team_size: input.min_team_size } : {}),
      ...(input.max_team_size !== undefined ? { max_team_size: input.max_team_size } : {}),
    })
    if (input.prizes) {
      mockEvent.prizes = input.prizes.map((p, i) => ({
        id: `prize-${i}`,
        name: p.name,
        amount_usd: p.amount_usd,
        description: p.description,
        track: p.track ?? null,
      }))
    }
    if (input.custom_questions) mockEvent.custom_questions = input.custom_questions
    if (input.criteria) mockEvent.criteria = input.criteria
    return delay(mockEvent)
  },

  createTrack: ({ name, description }) => {
    const track: Track = { id: `track-${nextId++}`, name, description, event_id: EVENT_ID, judges: [] }
    mockEvent.tracks = [...mockEvent.tracks, track]
    return delay(track)
  },

  updateTrack: (id, { name, description }) => {
    const track = mockEvent.tracks.find((t) => t.id === id)
    if (!track) return Promise.reject(new ApiError('Track not found', 404))
    if (name !== undefined) track.name = name
    if (description !== undefined) track.description = description
    return delay(track)
  },

  deleteTrack: (id) => {
    mockEvent.tracks = mockEvent.tracks.filter((t) => t.id !== id)
    return delay(undefined)
  },

  addTrackJudge: (trackId, email) => {
    const track = mockEvent.tracks.find((t) => t.id === trackId)
    if (!track) return Promise.reject(new ApiError('Track not found', 404))
    if (!track.judges.some((j) => j.email === email)) {
      track.judges = [...track.judges, { id: `judge-${nextId++}`, name: email.split('@')[0], email }]
    }
    // Mirrors the backend: appointing a track judge also lists them on the event.
    mockEvent.judge_ids = [...new Set(mockEvent.tracks.flatMap((t) => t.judges.map((j) => j.id)))]
    return delay(track)
  },

  removeTrackJudge: (trackId, userId) => {
    const track = mockEvent.tracks.find((t) => t.id === trackId)
    if (!track) return Promise.reject(new ApiError('Track not found', 404))
    track.judges = track.judges.filter((j) => j.id !== userId)
    mockEvent.judge_ids = [...new Set(mockEvent.tracks.flatMap((t) => t.judges.map((j) => j.id)))]
    return delay(track)
  },

  // No server behind the mock, so the "upload" is just a data URL.
  uploadImage: (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read that file'))
      reader.readAsDataURL(file)
    }),

  // Judging. One in-memory ballot box, keyed by project, standing in for the
  // unique (judge, project) index the real backend enforces.
  listBallots: (eventId) =>
    delay(ballots.filter((b) => !eventId || b.event_id === eventId)),

  saveBallot: (draft) => {
    const existing = ballots.find((b) => b.project_id === draft.project_id)
    const saved: Ballot = {
      id: existing?.id ?? `ballot-${nextId++}`,
      judge_id: 'mock-judge',
      judge_name: 'You',
      project_id: draft.project_id,
      event_id: EVENT_ID,
      scores: draft.scores,
      comment: draft.comment ?? '',
      updated_at: new Date().toISOString(),
    }
    ballots = existing ? ballots.map((b) => (b.id === saved.id ? saved : b)) : [...ballots, saved]
    return delay(saved)
  },

  /**
   * The same aggregation the backend does, over the mock ballot box.
   *
   * Duplicated rather than imported because backend/utils/standings.js is not
   * reachable from the browser bundle -- and the mock exists so the screens can
   * be built with no backend at all. The rules it has to match: each criterion
   * scaled to its own maximum before weighting, the mean taken per ballot, and
   * an unjudged entry left null rather than zero.
   */
  getStandings: (eventId, method = 'normalized') => {
    const criteria = mockEvent.criteria
    const entries = projects.filter((p) => p.status === 'submitted')

    const rows: StandingRow[] = entries.map((project) => {
      const mine = ballots.filter((b) => b.project_id === project.id)

      const perCriterion: Record<string, number | null> = {}
      for (const c of criteria) {
        const values = mine.map((b) => b.scores[c.key]).filter((v) => typeof v === 'number')
        perCriterion[c.key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
      }

      const ballotScores = mine.map((b) => {
        let total = 0
        let weight = 0
        for (const c of criteria) {
          const value = b.scores[c.key]
          if (typeof value !== 'number' || c.max_score <= 0) continue
          total += (value / c.max_score) * c.weight
          weight += c.weight
        }
        return weight > 0 ? total / weight : null
      })
      const scored = ballotScores.filter((v): v is number => v !== null)

      return {
        project_id: project.id,
        title: project.title,
        team_id: project.team_id,
        team_name: project.team,
        track_id: project.track || null,
        track_name: project.track_name ?? mockEvent.tracks.find((t) => t.id === project.track)?.name ?? null,
        ballot_count: mine.length,
        assigned_count: assignments.filter((a) => a.project_id === project.id).length,
        weighted_score: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
        // The mock's ballot box has exactly one judge ("You"), and a lone judge
        // has nobody to be compared with -- so normalization is genuinely the
        // identity here, which is what the real algorithm returns too.
        normalized_score: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
        corrected_ballots: 0,
        rank: null,
        track_rank: null,
        per_criterion: perCriterion,
      }
    })

    // Nulls last, then best first, then by title so the order is stable.
    const field = method === 'raw' ? 'weighted_score' : 'normalized_score'
    const bestFirst = (a: StandingRow, b: StandingRow) => {
      const x = a[field]
      const y = b[field]
      if (x === null && y === null) return a.title.localeCompare(b.title)
      if (x === null) return 1
      if (y === null) return -1
      if (y !== x) return y - x
      return a.title.localeCompare(b.title)
    }

    // Competition ranking (1, 2, 2, 4): a tie shares a rank and eats the next.
    const rank = (list: StandingRow[]): StandingRow[] => {
      let lastScore: number | null = null
      let lastRank = 0
      return list.map((row, i) => {
        const score = row[field]
        if (score === null) return { ...row, rank: null }
        const r = score === lastScore ? lastRank : i + 1
        lastScore = score
        lastRank = r
        return { ...row, rank: r }
      })
    }

    const overall = rank([...rows].sort(bestFirst))
    const trackRanks = new Map<string, number | null>()
    for (const trackId of new Set(rows.map((r) => r.track_id))) {
      for (const row of rank(overall.filter((r) => r.track_id === trackId).sort(bestFirst))) {
        trackRanks.set(row.project_id, row.rank)
      }
    }

    const standings = overall.map((row) => ({ ...row, track_rank: trackRanks.get(row.project_id) ?? null }))
    const scoredIds = new Set(ballots.map((b) => b.project_id))

    const result: Standings = {
      event_id: eventId,
      event_name: mockEvent.name,
      method,
      criteria,
      standings,
      normalization: { groups: ballots.length ? 1 : 0, corrected_ballots: 0, ballots: ballots.length },
      computed_at: new Date().toISOString(),
      progress: {
        project_count: entries.length,
        scored_project_count: entries.filter((p) => scoredIds.has(p.id)).length,
        unscored_project_count: entries.filter((p) => !scoredIds.has(p.id)).length,
        ballot_count: ballots.length,
        assignment_count: assignments.length,
        judges: [
          {
            judge_id: 'mock-judge',
            name: 'You',
            email: null,
            ballot_count: ballots.length,
            assigned_count: assignments.length,
            assigned_done: assignments.filter((a) => a.scored).length,
            mean_score: null,
            spread: null,
            corrected: false,
            uncorrected_reason: 'no-peers',
          },
        ],
      },
    }
    return delay(result)
  },

  getJudgeQueue: () => {
    const submitted = projects.filter((p) => p.status === 'submitted')
    if (assignments.length > 0) {
      const mine = new Set(assignments.map((a) => a.project_id))
      return delay({ mode: 'assigned' as const, projects: submitted.filter((p) => mine.has(p.id)) })
    }
    return delay({ mode: 'all' as const, projects: submitted })
  },

  // One judge in the mock, so a "batch" is just that judge on N=1 of each
  // entry; enough for the organizer screens to have something to show.
  listAssignments: () => delay(assignments),

  autoAssign: (_eventId, reviewsPerProject) => {
    const submitted = projects.filter((p) => p.status === 'submitted')
    for (const p of submitted) {
      if (assignments.some((a) => a.project_id === p.id)) continue
      assignments = [
        ...assignments,
        {
          id: `assignment-${nextId++}`,
          judge_id: 'mock-judge',
          judge_name: 'You',
          judge_email: null,
          project_id: p.id,
          project_title: p.title,
          track_name: p.track_name ?? null,
          source: 'auto',
          scored: ballots.some((b) => b.project_id === p.id),
        },
      ]
    }
    const short = reviewsPerProject > 1 ? submitted : []
    return delay({
      reviews_per_project: reviewsPerProject,
      dealt: assignments.length,
      adopted: 0,
      total: assignments.length,
      shortfall: short.map((p) => ({
        project_id: p.id,
        title: p.title,
        track_name: p.track_name ?? null,
        assigned: 1,
        wanted: reviewsPerProject,
        eligible_judges: 1,
      })),
      per_judge: [{ judge_id: 'mock-judge', name: 'You', email: null, assigned: assignments.length }],
    })
  },

  addAssignment: () => delay(undefined),

  removeAssignment: (id) => {
    assignments = assignments.filter((a) => a.id !== id)
    return delay(undefined)
  },

  clearAssignments: () => {
    assignments = []
    return delay(undefined)
  },

  listJudgeInvites: (trackId) => delay(judgeInvites.filter((i) => i.track_id === trackId)),

  createJudgeInvite: (trackId, email) => {
    const invite: JudgeInvite = {
      id: `judge-invite-${nextId++}`,
      track_id: trackId,
      email,
      token: `mock-${nextId++}`,
      status: 'pending',
      expires_at: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
      accepted_at: null,
    }
    judgeInvites = [invite, ...judgeInvites]
    return delay(invite)
  },

  revokeJudgeInvite: (id) => {
    judgeInvites = judgeInvites.map((i) => (i.id === id ? { ...i, status: 'revoked' as const } : i))
    return delay(undefined)
  },

  getJudgeInvite: (token) => {
    const invite = judgeInvites.find((i) => i.token === token)
    if (!invite) return Promise.reject(new ApiError('This invite link is not valid', 404))
    const track = mockEvent.tracks.find((t) => t.id === invite.track_id)
    return delay({
      event_id: EVENT_ID,
      event_name: mockEvent.name,
      track_name: track?.name ?? null,
      email_hint: invite.email.replace(/^(.).*@/, '$1***@'),
      status: invite.status,
      expires_at: invite.expires_at,
    })
  },

  acceptJudgeInvite: (token) => {
    judgeInvites = judgeInvites.map((i) => (i.token === token ? { ...i, status: 'accepted' as const } : i))
    return delay({ event_id: EVENT_ID })
  },

  castVote: (projectId) => {
    projects = projects.map((p) =>
      p.id === projectId && !p.has_voted ? { ...p, has_voted: true, vote_count: p.vote_count + 1 } : p,
    )
    const found = projects.find((p) => p.id === projectId)
    return delay({ vote_count: found?.vote_count ?? 0 })
  },
  withdrawVote: (projectId) => {
    projects = projects.map((p) =>
      p.id === projectId && p.has_voted ? { ...p, has_voted: false, vote_count: Math.max(0, p.vote_count - 1) } : p,
    )
    const found = projects.find((p) => p.id === projectId)
    return delay({ vote_count: found?.vote_count ?? 0 })
  },
  getCommunityPoll: (eventId) => {
    const rows = projects
      .filter((p) => p.status === 'submitted')
      .sort((a, b) => b.vote_count - a.vote_count)
      .map((p, i) => ({
        rank: i + 1,
        project_id: p.id,
        title: p.title,
        team_name: p.team,
        track: p.track_name ?? null,
        vote_count: p.vote_count,
      }))
    return delay({ event_id: eventId, total_votes: rows.reduce((s, r) => s + r.vote_count, 0), standings: rows })
  },
  listComments: (projectId) => delay(comments.filter((c) => c.project_id === projectId)),
  addComment: (projectId, body, parentId) => {
    const made: ProjectComment = {
      id: `cmt-${comments.length + 1}`,
      project_id: projectId,
      author: { id: 'me', name: 'You' },
      body,
      parent_id: parentId ?? null,
      removed: false,
      created_at: new Date().toISOString(),
    }
    comments = [...comments, made]
    return delay(made)
  },
  removeComment: (commentId) => {
    comments = comments.map((c) =>
      c.id === commentId ? { ...c, removed: true, author: null, body: '[removed by its author]' } : c,
    )
    return delay(undefined)
  },

  applyToJudge: (eventId, trackId) => {
    judgeApplications = [
      ...judgeApplications,
      {
        id: `app-${judgeApplications.length + 1}`,
        event_id: eventId,
        track_id: trackId,
        applicant: { id: 'me', name: 'You', email: 'you@example.com' },
        status: 'pending' as const,
        created_at: new Date().toISOString(),
      },
    ]
    return delay(undefined)
  },
  listJudgeApplications: (eventId) => delay(judgeApplications.filter((a) => a.event_id === eventId)),
  acceptJudgeApplication: (id) => {
    judgeApplications = judgeApplications.map((a) => (a.id === id ? { ...a, status: 'accepted' as const } : a))
    return delay(undefined)
  },
  rejectJudgeApplication: (id) => {
    judgeApplications = judgeApplications.map((a) => (a.id === id ? { ...a, status: 'rejected' as const } : a))
    return delay(undefined)
  },

  listAuditTrail: () => delay([] as AuditEntry[]),

  listNotifications: () => delay(notifications),
  markNotificationRead: (id) => {
    notifications = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    return delay(undefined)
  },

  // --- T4. The mock has no receiver, no signing key and no second instance,
  // so these answer with empty lists and honest refusals.
  listWebhooks: () => delay([] as Webhook[]),
  createWebhook: () => Promise.reject(new ApiError('Webhooks need the real backend', 501)),
  deleteWebhook: () => delay(undefined),
  listWebhookDeliveries: () => delay([] as WebhookDelivery[]),
  redeliverWebhook: () => Promise.reject(new ApiError('Webhooks need the real backend', 501)),

  listCertificates: () => delay([] as Certificate[]),
  issueCertificates: () => Promise.reject(new ApiError('Certificates need the real backend', 501)),
  myCertificates: () => delay([] as Certificate[]),
  verifyCertificate: () => Promise.reject(new ApiError('No certificate with that serial', 404)),

  exportEvent: () => Promise.reject(new ApiError('Export needs the real backend', 501)),
  importEvent: () => Promise.reject(new ApiError('Import needs the real backend', 501)),
}
