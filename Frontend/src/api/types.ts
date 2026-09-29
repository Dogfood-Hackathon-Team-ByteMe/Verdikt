// Shapes follow the DOGFOOD Tier 1 spec field names (snake_case). The backend
// speaks Mongo (camelCase, `_id`, populated refs); src/api/adapters.ts is the
// single place that translation happens, so nothing below leaks into the UI.

export type Role = 'visitor' | 'participant' | 'judge' | 'organizer' | 'admin'

export interface Track {
  id: string
  name: string
  description?: string
  event_id?: string
  /** Judges appointed on this track. Populated by the track endpoints. */
  judges: TeamMember[]
}

export interface Prize {
  id: string
  name: string
  amount_usd: number
  description?: string
  /** Track id, or null for an overall prize. */
  track?: string | null
}

/**
 * A question the organizer added to the submission form.
 * Answers live on Project.custom_answers, keyed by `key`.
 */
export interface CustomQuestion {
  key: string
  label: string
  type: 'text' | 'longtext' | 'url' | 'select'
  options?: string[]
  required: boolean
}

/**
 * One line of the organizer's scoring rubric.
 *
 * Weights are relative, not percentages -- a 3/1/1 rubric ranks identically to
 * a 60/20/20 one -- so the editor shows each line's share of the total rather
 * than asking the organizer to make the numbers add up.
 */
export interface Criterion {
  /** Stable machine key. It is the ballot's score key. */
  key: string
  label: string
  description?: string
  weight: number
  /** Top of this line's scale. 5 gives the familiar 1-5 ballot. */
  max_score: number
}

export interface HackEvent {
  id: string
  name: string
  tagline?: string
  description?: string
  starts_at: string
  submissions_close: string // ISO 8601 UTC
  tracks: Track[]
  prizes: Prize[]
  custom_questions: CustomQuestion[]
  /** The scoring rubric. Empty means the organizer has not set one yet. */
  criteria: Criterion[]
  min_team_size: number
  max_team_size: number
  /** Banner image. `/api/images/<id>` for an upload, or any URL. */
  banner_url?: string
  /**
   * User ids of the event's judges. Carried so the UI can tell someone they
   * may not enter *before* they click; the server enforces it either way.
   */
  judge_ids: string[]
  /**
   * Whether the organizer is accepting unsolicited judge applications.
   * Invites are the other way onto a panel; this one is opt-in and public.
   */
  judge_apply_open: boolean
}

/**
 * One line of the audit trail: a change to who can do what, and who made it.
 *
 * `action` is a dotted name from the backend's ACTIONS list. The UI renders any
 * it does not recognise verbatim rather than hiding it, because a row nobody
 * can read is still better than a row nobody can see.
 */
export interface AuditEntry {
  id: string
  action: string
  actor: TeamMember | null
  target_type?: string
  target_id?: string
  meta: Record<string, unknown>
  created_at: string | null
}

/** Someone asking to judge an event, and what the organizer decided. */
export interface JudgeApplication {
  id: string
  event_id: string
  track_id: string
  track_name?: string
  applicant: TeamMember
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string | null
}

export interface TeamMember {
  id: string
  name?: string
  email?: string
}

export interface Team {
  id: string
  name: string
  description?: string
  event_id?: string
  members: TeamMember[]
  /** The first member is the leader, by backend convention. */
  leader_id?: string
  project_id?: string | null
}

export interface Project {
  id: string
  /** Team name, for display. */
  team: string
  team_id: string
  /** Track id. */
  track: string
  track_name?: string
  event_id?: string

  title: string
  tagline?: string
  summary: string
  description?: string

  thumbnail_url?: string
  gallery_urls: string[]
  demo_video_url?: string
  repo_url: string
  live_url?: string

  /** `tags` kept as the display name; the backend calls these techTags. */
  tags: string[]
  custom_answers: Record<string, string>

  status: 'draft' | 'submitted'
  submitted_at: string | null

  /** Community poll: applause beside the judged ranking, never inside it. */
  vote_count: number
  /** Whether the signed-in viewer has voted for this project. */
  has_voted: boolean
}

/** One public comment on a project page. Threads are one level deep. */
export interface ProjectComment {
  id: string
  project_id: string
  /** Null on a removed comment, and on nothing else. */
  author: { id: string; name?: string } | null
  body: string
  parent_id: string | null
  removed: boolean
  created_at: string | null
}

/** One row of an event's community poll. */
export interface CommunityRow {
  rank: number
  project_id: string
  title: string
  team_name: string | null
  track: string | null
  vote_count: number
}

export interface CommunityPoll {
  event_id: string
  total_votes: number
  standings: CommunityRow[]
}

/** The subset of Project a team can write. Mirrors the backend allow-list. */
export interface ProjectDraft {
  title?: string
  tagline?: string
  summary?: string
  description?: string
  thumbnail_url?: string
  gallery_urls?: string[]
  demo_video_url?: string
  repo_url?: string
  live_url?: string
  tags?: string[]
  track?: string
  custom_answers?: Record<string, string>
}

export interface Invite {
  id: string
  token: string
  team_id: string
  team_name?: string
  expires_at?: string
}

export interface Notification {
  id: string
  type: string
  message: string
  is_read: boolean
  created_at: string
  reference_token?: string
}

/**
 * Landing-page counters. The backend has no /api/stats endpoint, so these are
 * derived client-side from the public list endpoints -- see http.ts.
 */
export interface PlatformStats {
  events: number
  projects: number
  judges: number
  teams: number
}

export interface ProjectQuery {
  q?: string
  track?: string
  event_id?: string
  status?: 'draft' | 'submitted'
}

/**
 * The subset of an event an organizer can write. Tracks are managed through
 * their own endpoints, so they are not part of this.
 */
export interface EventDraft {
  name?: string
  tagline?: string
  description?: string
  starts_at?: string
  submissions_close?: string
  min_team_size?: number
  max_team_size?: number
  banner_url?: string
  prizes?: Array<{ name: string; amount_usd: number; description?: string; track?: string | null }>
  custom_questions?: CustomQuestion[]
  criteria?: Criterion[]
  is_featured?: boolean
  is_judge_apply_open?: boolean
}

/**
 * One judge's ballot on one project.
 *
 * `scores` is keyed by Criterion.key. The backend enforces one ballot per judge
 * per project with a unique index, so this is the whole of what a judge has
 * said about a project -- there is no history to page through.
 */
export interface Ballot {
  id: string
  judge_id: string
  judge_name?: string
  project_id: string
  event_id: string
  scores: Record<string, number>
  comment: string
  updated_at: string | null
}

/** The part of a ballot a judge writes. */
export interface BallotDraft {
  project_id: string
  scores: Record<string, number>
  comment?: string
}

/**
 * One entry's line on the leaderboard.
 *
 * `rank` and `weighted_score` are null when no judge has scored it yet -- that
 * is "not been looked at", which the table has to show differently from
 * "scored badly". Never treat null as zero.
 */
export interface StandingRow {
  project_id: string
  title: string
  team_id: string
  team_name: string | null
  track_id: string | null
  track_name: string | null
  ballot_count: number
  /** Reviews this entry was assigned. 0 when the event has no assignments. */
  assigned_count: number
  /** 0..1, the raw mean of this entry's ballots. Null when unjudged. */
  weighted_score: number | null
  /**
   * The same, after cross-judge normalization (see JUDGING.md). On the same
   * 0..1 scale as the raw score, but not clamped: a strong entry seen by a
   * harsh judge can land slightly past either end.
   */
  normalized_score: number | null
  /** How many of this entry's ballots normalization could actually correct. */
  corrected_ballots: number
  /** Rank across the whole event, by the method the standings were asked for. */
  rank: number | null
  /** Rank within this entry's own track. Null when unjudged. */
  track_rank: number | null
  /** Mean score per criterion key, on that criterion's own scale. */
  per_criterion: Record<string, number | null>
}

export interface JudgeProgress {
  judge_id: string
  name: string | null
  email: string | null
  ballot_count: number
  assigned_count: number
  /** Of their assignments, how many they have scored. */
  assigned_done: number
  /** This judge's mean ballot score, 0..1: how harsh or generous they are. */
  mean_score: number | null
  spread: number | null
  /** Whether normalization could correct this judge's ballots. */
  corrected: boolean
  /** Why not, when it could not: too few ballots, or nobody to compare with. */
  uncorrected_reason: 'too-few-ballots' | 'no-peers' | null
}

export type RankingMethod = 'normalized' | 'raw'

/** The organizer's view of judging: the table, and how far it has got. */
export interface Standings {
  event_id: string
  event_name: string
  method: RankingMethod
  criteria: Criterion[]
  standings: StandingRow[]
  normalization: {
    /** Separately-comparable groups of judges. More than 1: see JUDGING.md. */
    groups: number
    corrected_ballots: number
    ballots: number
  }
  progress: {
    project_count: number
    scored_project_count: number
    unscored_project_count: number
    ballot_count: number
    assignment_count: number
    judges: JudgeProgress[]
  }
  computed_at: string
}

/**
 * What a judge may score in one event, and why.
 *   assigned  the organizer dealt batches; this is the judge's batch
 *   tracks    no batches yet; entries in the tracks they were appointed to
 *   all       an event-wide judge
 */
export interface JudgeQueue {
  mode: 'assigned' | 'tracks' | 'all'
  projects: Project[]
}

export interface Assignment {
  id: string
  judge_id: string
  judge_name: string | null
  judge_email: string | null
  project_id: string
  project_title: string | null
  track_name: string | null
  source: 'auto' | 'manual' | 'ballot'
  scored: boolean
}

/** What a batch-assignment run did. */
export interface AssignmentRun {
  reviews_per_project: number
  dealt: number
  adopted: number
  total: number
  shortfall: Array<{
    project_id: string
    title: string
    track_name: string | null
    assigned: number
    wanted: number
    eligible_judges: number
  }>
  per_judge: Array<{ judge_id: string; name: string | null; email: string | null; assigned: number }>
}

export type JudgeInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

/** The organizer's view of a judge invite, including the secret token. */
export interface JudgeInvite {
  id: string
  track_id: string
  email: string
  token: string
  status: JudgeInviteStatus
  expires_at: string | null
  accepted_at: string | null
}

/** What anyone holding the link may see before accepting. */
export interface JudgeInvitePreview {
  event_id: string
  event_name: string | null
  track_name: string | null
  /** A masked hint of the address the invite is bound to. */
  email_hint: string
  status: JudgeInviteStatus
  expires_at: string | null
}

// --- Tier 4: webhooks, certificates, portability ----------------------------

/** One organizer-registered webhook endpoint on an event. */
export interface Webhook {
  id: string
  event_id: string
  url: string
  /** Delivery types wanted; empty means all of them. */
  events: string[]
  /** The signing secret. Organizer-only; every delivery is HMAC-signed with it. */
  secret: string
  active: boolean
  created_at: string | null
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed'

/** One payload sent (or attempted) to one webhook. */
export interface WebhookDelivery {
  id: string
  type: string
  status: WebhookDeliveryStatus
  attempts: number
  response_status: number | null
  error: string | null
  created_at: string | null
  delivered_at: string | null
}

export type CertificateKind = 'participation' | 'placement' | 'judge'

/** One issued certificate or signed judge record. */
export interface Certificate {
  id: string
  serial: string
  kind: CertificateKind
  recipient_name: string
  event_name: string | null
  /** The exact signed JSON record, parseable for display. */
  record: string
  created_at: string | null
}

/** What the public verification endpoint answers with. */
export interface CertificateVerification {
  serial: string
  kind: CertificateKind
  valid: boolean
  record: string
  signature: string
  public_key_pem: string
  details: {
    event?: { id?: string; name?: string }
    recipient?: { name?: string }
    team?: string
    project?: string
    place?: number
    role?: string
    tracks?: string[]
    ballotsCast?: number
    issuedAt?: string
  }
}

/** What importing a bundle created. */
export interface ImportSummary {
  event_id: string
  name: string
  tracks: number
  teams: number
  projects: number
  ballots: number
  people: number
}
