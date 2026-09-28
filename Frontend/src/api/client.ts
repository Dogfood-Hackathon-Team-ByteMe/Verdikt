import type {
  Assignment,
  AssignmentRun,
  Ballot,
  BallotDraft,
  EventDraft,
  HackEvent,
  Invite,
  AuditEntry,
  CommunityPoll,
  JudgeApplication,
  ProjectComment,
  JudgeInvite,
  JudgeInvitePreview,
  JudgeQueue,
  Notification,
  PlatformStats,
  Project,
  ProjectDraft,
  ProjectQuery,
  RankingMethod,
  Standings,
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
  /**
   * Appoint a judge on a track, by email. Assigning them here also lists them
   * on the event, which is what makes them a judge of it.
   */
  addTrackJudge(trackId: string, email: string): Promise<Track>
  removeTrackJudge(trackId: string, userId: string): Promise<Track>

  /**
   * Upload an image and get back the URL to store on a record.
   * The file is sent as the raw body; the backend caps it at 2 MB.
   */
  uploadImage(file: File): Promise<string>

  // --- Judging ------------------------------------------------------------
  /**
   * The ballots the caller may read. A judge always gets only their own --
   * that narrowing is the server's, not this client's.
   */
  listBallots(eventId?: string): Promise<Ballot[]>
  /** Create or replace the caller's ballot for one project. */
  saveBallot(draft: BallotDraft): Promise<Ballot>
  /**
   * The computed leaderboard for one event. Organiser of that event, or admin.
   * Derived on every read, so it reflects the ballots as they stand.
   */
  getStandings(eventId: string, method?: RankingMethod): Promise<Standings>

  /**
   * The entries the caller may score in this event, as the server decides it:
   * their batch if the organizer dealt assignments, otherwise their tracks.
   */
  getJudgeQueue(eventId: string): Promise<JudgeQueue>

  // --- Batch assignment (organizer) --------------------------------------
  listAssignments(eventId: string): Promise<Assignment[]>
  /** Deal, or top up, N reviews per submitted entry across the panel. */
  autoAssign(eventId: string, reviewsPerProject: number): Promise<AssignmentRun>
  addAssignment(eventId: string, judgeId: string, projectId: string): Promise<void>
  removeAssignment(assignmentId: string): Promise<void>
  clearAssignments(eventId: string): Promise<void>

  // --- Judge invites -----------------------------------------------------
  listJudgeInvites(trackId: string): Promise<JudgeInvite[]>
  createJudgeInvite(trackId: string, email: string): Promise<JudgeInvite>
  revokeJudgeInvite(inviteId: string): Promise<void>
  /** Public: which event and track, before the holder commits. */
  getJudgeInvite(token: string): Promise<JudgeInvitePreview>
  acceptJudgeInvite(token: string): Promise<{ event_id: string }>

  // --- Judge applications -------------------------------------------------
  /** Ask to judge an event that has opened applications. */
  applyToJudge(eventId: string, trackId: string): Promise<void>
  /** Organizer only: everyone who has asked, pending or decided. */
  listJudgeApplications(eventId: string): Promise<JudgeApplication[]>
  acceptJudgeApplication(applicationId: string): Promise<void>
  rejectJudgeApplication(applicationId: string): Promise<void>

  // --- Community: votes and comments --------------------------------------
  /** Vote for a project. Refused for your own team, judges, organisers, admins. */
  castVote(projectId: string): Promise<{ vote_count: number }>
  withdrawVote(projectId: string): Promise<{ vote_count: number }>
  /** The event's poll, ranked by votes. Public. */
  getCommunityPoll(eventId: string): Promise<CommunityPoll>

  listComments(projectId: string): Promise<ProjectComment[]>
  addComment(projectId: string, body: string, parentId?: string): Promise<ProjectComment>
  /** Author takes it back, or the event's organiser moderates. */
  removeComment(commentId: string): Promise<void>

  // --- Audit trail --------------------------------------------------------
  /** Organizer or admin only: who changed this event's panel, newest first. */
  listAuditTrail(eventId: string): Promise<AuditEntry[]>

  // --- Notifications ------------------------------------------------------
  listNotifications(): Promise<Notification[]>
  markNotificationRead(id: string): Promise<void>
}
