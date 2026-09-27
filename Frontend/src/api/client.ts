import type {
  EventDraft,
  HackEvent,
  Invite,
  Notification,
  PlatformStats,
  Project,
  ProjectDraft,
  ProjectQuery,
  Team,
  Track,
} from './types'

/**
 * Everything the app reads or writes goes through this interface.
 *
 * Two implementations satisfy it: `mock.ts` (browser-only sample data, the
 * default) and `http.ts` (the real backend, used when VITE_API_URL is set).
 * Components depend on this and never learn which one they got.
 *
 * Authentication is deliberately NOT here -- it lives in ./auth.ts, because
 * sessions have their own lifecycle and their own provider.
 */
export interface VerdiktApi {
  // --- Public reads -------------------------------------------------------
  getFeaturedEvent(): Promise<HackEvent>
  listEvents(): Promise<HackEvent[]>
  listTracks(eventId?: string): Promise<Track[]>
  /** Submitted projects, plus any drafts the caller is allowed to see. */
  listProjects(query?: ProjectQuery): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  listTeams(eventId?: string): Promise<Team[]>
  getTeam(id: string): Promise<Team | null>
  /** Derived client-side; there is no single stats endpoint. */
  getStats(): Promise<PlatformStats>

  // --- Teams (authenticated) ---------------------------------------------
  createTeam(input: { name: string; description?: string; event_id: string }): Promise<Team>
  updateTeam(id: string, input: { name?: string; description?: string }): Promise<Team>
  removeMember(teamId: string, userId: string): Promise<Team>

  // --- Invites ------------------------------------------------------------
  createInvite(teamId: string): Promise<Invite>
  /** Public: shows the team name before you commit to joining. */
  getInvite(token: string): Promise<Invite>
  acceptInvite(token: string): Promise<Team>

  // --- Projects (authenticated) -------------------------------------------
  createProject(input: ProjectDraft & { team_id: string }): Promise<Project>
  updateProject(id: string, input: ProjectDraft): Promise<Project>
  /** Draft -> submitted. Rejected server-side after the deadline. */
  submitProject(id: string): Promise<Project>
  unsubmitProject(id: string): Promise<Project>

  /** Leave a team. Passing your own id is how a member removes themselves. */
  leaveTeam(teamId: string, userId: string): Promise<Team>
  deleteProject(id: string): Promise<void>

  // --- Organizer ----------------------------------------------------------
  /** The events this user organises, resolved client-side from /api/events. */
  listMyEvents(organiserIn: string[]): Promise<HackEvent[]>
  getEvent(id: string): Promise<HackEvent | null>
  createEvent(input: EventDraft & { name: string; description: string; submissions_close: string }): Promise<HackEvent>
  updateEvent(id: string, input: EventDraft): Promise<HackEvent>
  createTrack(input: { event_id: string; name: string; description?: string }): Promise<Track>
  updateTrack(id: string, input: { name?: string; description?: string }): Promise<Track>
  deleteTrack(id: string): Promise<void>

  // --- Notifications ------------------------------------------------------
  listNotifications(): Promise<Notification[]>
  markNotificationRead(id: string): Promise<void>
}
