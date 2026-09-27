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
import type { EventDraft, HackEvent, Invite, Notification, PlatformStats, Project, ProjectDraft, ProjectQuery, Team, Track } from './types'
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
    { id: 'judging', name: 'Judging Engines' },
    { id: 'devtools', name: 'Developer Tools' },
    { id: 'infra', name: 'Infrastructure' },
    { id: 'security', name: 'Security' },
    { id: 'data', name: 'Data & ML' },
    { id: 'civic', name: 'Civic Tech' },
    { id: 'edu', name: 'Education' },
    { id: 'oss', name: 'Open Source Health' },
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
  min_team_size: 1,
  max_team_size: 4,
  // No judges in the sample data, so nothing is barred from entering it.
  judge_ids: [],
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
    return delay(mockEvent)
  },

  createTrack: ({ name, description }) => {
    const track: Track = { id: `track-${nextId++}`, name, description, event_id: EVENT_ID }
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

  // No server behind the mock, so the "upload" is just a data URL.
  uploadImage: (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read that file'))
      reader.readAsDataURL(file)
    }),

  listNotifications: () => delay(notifications),
  markNotificationRead: (id) => {
    notifications = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    return delay(undefined)
  },
}
