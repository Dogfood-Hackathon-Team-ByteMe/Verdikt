/**
 * Real-backend implementation of VerdiktApi.
 *
 * Route paths match the backend's `.dogfood.toml [routes]`. Every response is
 * unwrapped from `{ success, data, message }` and run through ./adapters.ts,
 * so nothing Mongo-shaped reaches a component.
 *
 * `credentials: 'include'` on every call carries the httpOnly session cookie.
 * In docker-compose the SPA and API share an origin (nginx proxies /api), so
 * this is same-site; against a separate dev server the API must send CORS
 * `credentials: true` with an explicit origin.
 */
import {
  fromEventDraft,
  fromProjectDraft,
  refId,
  toAssignment,
  toAssignmentRun,
  toBallot,
  toHackEvent,
  toInvite,
  toAuditEntry,
  toCommunityPoll,
  toJudgeApplication,
  toJudgeInvite,
  toJudgeInvitePreview,
  toJudgeQueue,
  toNotification,
  toProject,
  toProjectComment,
  toStandings,
  toTeam,
  toTrack,
  toCertificate,
  toCertificateVerification,
  toImportSummary,
  toWebhook,
  toWebhookDelivery,
} from './adapters'
import type { VerdiktApi } from './client'
import type { BallotDraft, EventDraft, PlatformStats, ProjectDraft, ProjectQuery } from './types'
import { ApiError, unwrap } from './unwrap'

export const routes = {
  events: '/api/events',
  featuredEvent: '/api/events/featured',
  tracks: '/api/tracks',
  projects: '/api/projects',
  project: (id: string) => `/api/projects/${encodeURIComponent(id)}`,
  submitProject: (id: string) => `/api/projects/${encodeURIComponent(id)}/submit`,
  unsubmitProject: (id: string) => `/api/projects/${encodeURIComponent(id)}/unsubmit`,
  event: (id: string) => `/api/events/${encodeURIComponent(id)}`,
  track: (id: string) => `/api/tracks/${encodeURIComponent(id)}`,
  trackJudges: (id: string) => `/api/tracks/${encodeURIComponent(id)}/judges`,
  trackJudge: (id: string, userId: string) =>
    `/api/tracks/${encodeURIComponent(id)}/judges/${encodeURIComponent(userId)}`,
  teams: '/api/teams',
  team: (id: string) => `/api/teams/${encodeURIComponent(id)}`,
  teamMember: (teamId: string, userId: string) =>
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
  invites: '/api/invites',
  invite: (token: string) => `/api/invites/token/${encodeURIComponent(token)}`,
  acceptInvite: (token: string) => `/api/invites/token/${encodeURIComponent(token)}/accept`,
  images: '/api/images',
  scores: '/api/scores',
  ballot: '/api/scores/ballot',
  standings: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/standings`,
  standingsCsv: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/standings.csv`,
  judgeQueue: '/api/judge/queue',
  assignments: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/assignments`,
  autoAssign: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/assignments/auto`,
  assignment: (id: string) => `/api/assignments/${encodeURIComponent(id)}`,
  judgeInvites: (trackId: string) => `/api/tracks/${encodeURIComponent(trackId)}/judge-invites`,
  judgeInvite: (id: string) => `/api/judge-invites/${encodeURIComponent(id)}`,
  judgeInviteToken: (token: string) => `/api/judge-invites/token/${encodeURIComponent(token)}`,
  acceptJudgeInvite: (token: string) => `/api/judge-invites/token/${encodeURIComponent(token)}/accept`,
  audit: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/audit`,
  vote: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/vote`,
  community: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/community`,
  comments: (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/comments`,
  comment: (id: string) => `/api/comments/${encodeURIComponent(id)}`,
  judgeApplications: '/api/judge-applications',
  judgeApplicationsForEvent: (eventId: string) =>
    `/api/judge-applications/event/${encodeURIComponent(eventId)}`,
  acceptJudgeApplication: (id: string) => `/api/judge-applications/${encodeURIComponent(id)}/accept`,
  rejectJudgeApplication: (id: string) => `/api/judge-applications/${encodeURIComponent(id)}/reject`,
  notifications: '/api/notifications',
  notificationRead: (id: string) => `/api/notifications/${encodeURIComponent(id)}/read`,
  webhooks: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/webhooks`,
  webhook: (id: string) => `/api/webhooks/${encodeURIComponent(id)}`,
  webhookDeliveries: (id: string) => `/api/webhooks/${encodeURIComponent(id)}/deliveries`,
  redeliver: (id: string, deliveryId: string) =>
    `/api/webhooks/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
  certificates: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/certificates`,
  myCertificates: '/api/certificates/mine',
  verifyCertificate: (serial: string) => `/api/v1/certificates/${encodeURIComponent(serial)}`,
  exportEvent: (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/export`,
  importEvent: '/api/events/import',
}

/** Build a query string, dropping empty values. */
function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const out = search.toString()
  return out ? `?${out}` : ''
}

export function createHttpApi(baseUrl: string): VerdiktApi {
  // '/' means same-origin, so strip it to an empty prefix.
  const base = baseUrl.replace(/\/$/, '')

  const send = async (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(base + path, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  const get = async <T,>(path: string): Promise<T> => unwrap<T>(await send('GET', path))
  const post = async <T,>(path: string, body?: unknown): Promise<T> => unwrap<T>(await send('POST', path, body))
  const put = async <T,>(path: string, body?: unknown): Promise<T> => unwrap<T>(await send('PUT', path, body))
  const patch = async <T,>(path: string, body?: unknown): Promise<T> => unwrap<T>(await send('PATCH', path, body))

  /** 404/403 on a single-item read means "not visible", not "broken". */
  const orNull = async <T,>(load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null
      throw error
    }
  }

  const listProjectDocs = (query: ProjectQuery = {}) =>
    get<Record<string, unknown>[]>(
      routes.projects + qs({ q: query.q, track: query.track, eventId: query.event_id, status: query.status }),
    )

  return {
    // --- Public reads -----------------------------------------------------
    getFeaturedEvent: async () => toHackEvent(await get(routes.featuredEvent)),

    listEvents: async () => (await get<Record<string, unknown>[]>(routes.events)).map(toHackEvent),

    listTracks: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.tracks + qs({ eventId }))).map(toTrack),

    listProjects: async (query = {}) => (await listProjectDocs(query)).map(toProject),

    getProject: async (id) => {
      const doc = await orNull(() => get<Record<string, unknown>>(routes.project(id)))
      return doc ? toProject(doc) : null
    },

    listTeams: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.teams + qs({ eventId }))).map(toTeam),

    getTeam: async (id) => {
      const doc = await orNull(() => get<Record<string, unknown>>(routes.team(id)))
      return doc ? toTeam(doc) : null
    },

    /**
     * The backend has no single stats endpoint, so the counters are derived
     * from three public list calls. Judges come off the featured event's
     * judgeIds via its populated shape; teams and projects are list lengths.
     */
    getStats: async (): Promise<PlatformStats> => {
      const [events, projects, teams] = await Promise.all([
        get<Record<string, unknown>[]>(routes.events).catch(() => []),
        listProjectDocs({}).catch(() => []),
        get<Record<string, unknown>[]>(routes.teams).catch(() => []),
      ])

      const judgeIds = new Set<string>()
      for (const event of events) {
        for (const id of (event.judgeIds as unknown[]) ?? []) {
          judgeIds.add(typeof id === 'string' ? id : String((id as { _id?: string })?._id ?? ''))
        }
      }

      return { events: events.length, projects: projects.length, judges: judgeIds.size, teams: teams.length }
    },

    // --- Teams ------------------------------------------------------------
    createTeam: async ({ name, description, event_id }) =>
      toTeam(await post(routes.teams, { name, description, eventId: event_id })),

    updateTeam: async (id, input) => toTeam(await put(routes.team(id), input)),

    removeMember: async (teamId, userId) => toTeam(await unwrap(await send('DELETE', routes.teamMember(teamId, userId)))),

    // --- Invites ----------------------------------------------------------
    createInvite: async (teamId) => toInvite(await post(routes.invites, { teamId })),
    getInvite: async (token) => toInvite(await get(routes.invite(token))),
    acceptInvite: async (token) => toTeam(await post(routes.acceptInvite(token))),

    // --- Projects ---------------------------------------------------------
    createProject: async ({ team_id, ...draft }) =>
      toProject(await post(routes.projects, { ...fromProjectDraft(draft as Record<string, unknown>), teamId: team_id })),

    updateProject: async (id, draft: ProjectDraft) =>
      toProject(await put(routes.project(id), fromProjectDraft(draft as Record<string, unknown>))),

    submitProject: async (id) => toProject(await post(routes.submitProject(id))),
    unsubmitProject: async (id) => toProject(await post(routes.unsubmitProject(id))),

    leaveTeam: async (teamId, userId) => toTeam(await unwrap(await send('DELETE', routes.teamMember(teamId, userId)))),
    deleteTeam: async (id) => {
      await unwrap(await send('DELETE', routes.team(id)))
    },

    deleteProject: async (id) => {
      await unwrap<void>(await send('DELETE', routes.project(id)))
    },

    // --- Organizer --------------------------------------------------------
    /**
     * There is no "events I organise" endpoint, so the full list is fetched
     * and filtered against the ids already on the session user. Events are
     * few, so this costs nothing; projects would not be filtered this way.
     */
    listMyEvents: async (organiserIn) => {
      const all = (await get<Record<string, unknown>[]>(routes.events)).map(toHackEvent)
      return all.filter((e) => organiserIn.includes(e.id))
    },

    getEvent: async (id) => {
      const doc = await orNull(() => get<Record<string, unknown>>(routes.event(id)))
      return doc ? toHackEvent(doc) : null
    },

    createEvent: async (input) => toHackEvent(await post(routes.events, fromEventDraft({ ...input }))),

    deleteEvent: async (id) => {
      await unwrap(await send('DELETE', routes.event(id)))
    },
    updateEvent: async (id, input: EventDraft) =>
      toHackEvent(await put(routes.event(id), fromEventDraft({ ...input }))),

    createTrack: async ({ event_id, name, description }) =>
      // The backend field is `topic`; the UI calls it a name everywhere.
      toTrack(await post(routes.tracks, { eventId: event_id, topic: name, description })),

    updateTrack: async (id, { name, description }) =>
      toTrack(await put(routes.track(id), { ...(name !== undefined ? { topic: name } : {}), description })),

    deleteTrack: async (id) => {
      await unwrap<void>(await send('DELETE', routes.track(id)))
    },

    addTrackJudge: async (trackId, email) => toTrack(await post(routes.trackJudges(trackId), { email })),

    removeTrackJudge: async (trackId, userId) =>
      toTrack(await unwrap<Record<string, unknown>>(await send('DELETE', routes.trackJudge(trackId, userId)))),

    /**
     * Raw bytes, not multipart: the backend mounts express.raw() for image
     * types, which avoids taking on a multipart parser for one endpoint.
     * fetch() sends a File as its own body with the right Content-Type.
     */
    uploadImage: async (file: File) => {
      const res = await fetch(base + routes.images, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': file.type },
        body: file,
      })
      const { url } = await unwrap<{ url: string }>(res)
      return url
    },

    // --- Judging ----------------------------------------------------------
    /**
     * A judge gets their own ballots and an organiser gets their event's; the
     * server decides which, so this sends the same request either way.
     *
     * A 403 comes back as an empty list rather than an error: it means "you
     * judge nothing here", which is a state the judging screen renders, not a
     * failure it should show a red box for.
     */
    listBallots: async (eventId) => {
      try {
        const docs = await get<Record<string, unknown>[]>(routes.scores + qs({ eventId }))
        return docs.map(toBallot)
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) return []
        throw error
      }
    },

    saveBallot: async (draft: BallotDraft) =>
      toBallot(
        await put<Record<string, unknown>>(routes.ballot, {
          projectId: draft.project_id,
          scores: draft.scores,
          comment: draft.comment ?? '',
        }),
      ),

    getStandings: async (eventId, method) =>
      toStandings(await get(routes.standings(eventId) + qs({ method }))),

    getJudgeQueue: async (eventId) => toJudgeQueue(await get(routes.judgeQueue + qs({ eventId }))),

    // --- Batch assignment -------------------------------------------------
    listAssignments: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.assignments(eventId))).map(toAssignment),

    autoAssign: async (eventId, reviewsPerProject) =>
      toAssignmentRun(await post(routes.autoAssign(eventId), { reviewsPerProject })),

    addAssignment: async (eventId, judgeId, projectId) => {
      await post(routes.assignments(eventId), { judgeId, projectId })
    },

    removeAssignment: async (id) => {
      await unwrap<void>(await send('DELETE', routes.assignment(id)))
    },

    clearAssignments: async (eventId) => {
      await unwrap<void>(await send('DELETE', routes.assignments(eventId)))
    },

    // --- Judge invites ----------------------------------------------------
    listJudgeInvites: async (trackId) =>
      (await get<Record<string, unknown>[]>(routes.judgeInvites(trackId))).map(toJudgeInvite),

    createJudgeInvite: async (trackId, email) => toJudgeInvite(await post(routes.judgeInvites(trackId), { email })),

    revokeJudgeInvite: async (id) => {
      await unwrap<void>(await send('DELETE', routes.judgeInvite(id)))
    },

    getJudgeInvite: async (token) => toJudgeInvitePreview(await get(routes.judgeInviteToken(token))),

    acceptJudgeInvite: async (token) => {
      const data = await post<{ eventId?: string }>(routes.acceptJudgeInvite(token))
      return { event_id: refId(data?.eventId) }
    },

    // --- Notifications ----------------------------------------------------
    applyToJudge: async (eventId, trackId) => {
      await post(routes.judgeApplications, { eventId, trackId })
    },

    listJudgeApplications: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.judgeApplicationsForEvent(eventId))).map(toJudgeApplication),

    acceptJudgeApplication: async (id) => {
      await post(routes.acceptJudgeApplication(id))
    },

    rejectJudgeApplication: async (id) => {
      await post(routes.rejectJudgeApplication(id))
    },

    castVote: async (projectId) => {
      const data = await post<{ voteCount?: number }>(routes.vote(projectId))
      return { vote_count: data?.voteCount ?? 0 }
    },

    withdrawVote: async (projectId) => {
      const data = await unwrap<{ voteCount?: number }>(await send('DELETE', routes.vote(projectId)))
      return { vote_count: data?.voteCount ?? 0 }
    },

    getCommunityPoll: async (eventId) => toCommunityPoll(await get(routes.community(eventId))),

    listComments: async (projectId) =>
      (await get<Record<string, unknown>[]>(routes.comments(projectId))).map(toProjectComment),

    addComment: async (projectId, body, parentId) =>
      toProjectComment(await post(routes.comments(projectId), parentId ? { body, parentId } : { body })),

    removeComment: async (commentId) => {
      await unwrap<void>(await send('DELETE', routes.comment(commentId)))
    },

    listAuditTrail: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.audit(eventId))).map(toAuditEntry),

    listNotifications: async () => (await get<Record<string, unknown>[]>(routes.notifications)).map(toNotification),
    markNotificationRead: async (id) => {
      await patch(routes.notificationRead(id))
    },

    // --- T4: webhooks -----------------------------------------------------
    listWebhooks: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.webhooks(eventId))).map(toWebhook),

    createWebhook: async (eventId, input) =>
      toWebhook(await post(routes.webhooks(eventId), { url: input.url, events: input.events ?? [] })),

    deleteWebhook: async (id) => {
      await unwrap<void>(await send('DELETE', routes.webhook(id)))
    },

    listWebhookDeliveries: async (webhookId) =>
      (await get<Record<string, unknown>[]>(routes.webhookDeliveries(webhookId))).map(toWebhookDelivery),

    redeliverWebhook: async (webhookId, deliveryId) =>
      toWebhookDelivery(await post(routes.redeliver(webhookId, deliveryId))),

    // --- T4: certificates -------------------------------------------------
    listCertificates: async (eventId) =>
      (await get<Record<string, unknown>[]>(routes.certificates(eventId))).map(toCertificate),

    issueCertificates: async (eventId, input) =>
      (
        await post<Record<string, unknown>[]>(routes.certificates(eventId), {
          kind: input.kind,
          ...(input.project_id ? { projectId: input.project_id } : {}),
          ...(input.place !== undefined ? { place: input.place } : {}),
        })
      ).map(toCertificate),

    myCertificates: async () =>
      (await get<Record<string, unknown>[]>(routes.myCertificates)).map(toCertificate),

    verifyCertificate: async (serial) =>
      toCertificateVerification(await get<Record<string, unknown>>(routes.verifyCertificate(serial))),

    // --- T4: portability ----------------------------------------------------
    /** The export is the bundle itself, not wrapped in the {success,data} envelope. */
    exportEvent: async (eventId) => {
      const res = await send('GET', routes.exportEvent(eventId))
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let message = `Export failed (${res.status})`
        try {
          message = (JSON.parse(text) as { message?: string }).message ?? message
        } catch {
          /* keep the fallback */
        }
        throw new ApiError(message, res.status)
      }
      return (await res.json()) as unknown
    },

    importEvent: async (bundle) => toImportSummary(await post(routes.importEvent, bundle)),
  }
}
