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
import { fromEventDraft, fromProjectDraft, toHackEvent, toInvite, toNotification, toProject, toTeam, toTrack } from './adapters'
import type { VerdiktApi } from './client'
import type { EventDraft, PlatformStats, ProjectDraft, ProjectQuery } from './types'
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
  teams: '/api/teams',
  team: (id: string) => `/api/teams/${encodeURIComponent(id)}`,
  teamMember: (teamId: string, userId: string) =>
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
  invites: '/api/invites',
  invite: (token: string) => `/api/invites/token/${encodeURIComponent(token)}`,
  acceptInvite: (token: string) => `/api/invites/token/${encodeURIComponent(token)}/accept`,
  images: '/api/images',
  notifications: '/api/notifications',
  notificationRead: (id: string) => `/api/notifications/${encodeURIComponent(id)}/read`,
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

    // --- Notifications ----------------------------------------------------
    listNotifications: async () => (await get<Record<string, unknown>[]>(routes.notifications)).map(toNotification),
    markNotificationRead: async (id) => {
      await patch(routes.notificationRead(id))
    },
  }
}
