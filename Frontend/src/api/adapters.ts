/**
 * Mongo document -> app type.
 *
 * This is the ONLY file that knows the backend speaks camelCase with `_id` and
 * populated refs. Everything downstream sees the snake_case shapes in
 * ./types.ts. When the backend renames a field, it changes here and nowhere
 * else.
 *
 * Two recurring shapes to be careful with:
 *   - a ref is either a raw id string or a populated document, depending on
 *     which repository method served it -> `refId()` / `refField()`
 *   - a Mongoose Map serialises to a plain object, but can be absent entirely
 */
import type {
  Assignment,
  AssignmentRun,
  Ballot,
  Criterion,
  CustomQuestion,
  HackEvent,
  Invite,
  JudgeInvite,
  JudgeInvitePreview,
  JudgeInviteStatus,
  JudgeProgress,
  JudgeQueue,
  Notification,
  Prize,
  Project,
  StandingRow,
  Standings,
  Team,
  Track,
} from './types'

/** Anything with an id, in either of the two shapes the backend emits. */
type Ref = string | { _id?: string; id?: string; [key: string]: unknown } | null | undefined

/** The id of a ref, whether it arrived populated or raw. */
export function refId(ref: Ref): string {
  if (!ref) return ''
  if (typeof ref === 'string') return ref
  return ref._id ?? ref.id ?? ''
}

/** A field off a populated ref, or undefined if it came back raw. */
function refField(ref: Ref, field: string): string | undefined {
  if (!ref || typeof ref === 'string') return undefined
  const value = ref[field]
  return typeof value === 'string' ? value : undefined
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

/** ISO string from a Date-ish value, or null. */
const iso = (value: unknown): string | null => {
  if (!value) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// --- Track -----------------------------------------------------------------

interface TrackDoc {
  _id?: string
  topic?: string
  description?: string
  eventId?: Ref
  judges?: Ref[]
}

export function toTrack(doc: TrackDoc): Track {
  return {
    id: doc._id ?? '',
    // The backend calls it `topic`; the UI calls every one of these a name.
    name: doc.topic ?? 'Untitled track',
    description: str(doc.description),
    event_id: refId(doc.eventId) || undefined,
    judges: (doc.judges ?? []).map((j) => ({
      id: refId(j),
      name: refField(j, 'name'),
      email: refField(j, 'email'),
    })),
  }
}

// --- Event -----------------------------------------------------------------

interface PrizeDoc {
  _id?: string
  name?: string
  amountUsd?: number
  description?: string
  trackId?: Ref
}

interface QuestionDoc {
  key?: string
  label?: string
  type?: string
  options?: string[]
  required?: boolean
}

interface CriterionDoc {
  key?: string
  label?: string
  description?: string
  weight?: number
  maxScore?: number
}

interface EventDoc {
  _id?: string
  name?: string
  tagline?: string
  description?: string
  startsAt?: string
  submissionsClose?: string
  tracks?: TrackDoc[] | string[]
  prizes?: PrizeDoc[]
  customQuestions?: QuestionDoc[]
  criteria?: CriterionDoc[]
  minTeamSize?: number
  maxTeamSize?: number
  bannerUrl?: string
  judgeIds?: Ref[]
  createdAt?: string
}

function toPrize(doc: PrizeDoc, index: number): Prize {
  return {
    id: doc._id ?? `prize-${index}`,
    name: doc.name ?? 'Prize',
    amount_usd: typeof doc.amountUsd === 'number' ? doc.amountUsd : 0,
    description: str(doc.description),
    track: refId(doc.trackId) || null,
  }
}

function toQuestion(doc: QuestionDoc): CustomQuestion {
  const type = doc.type as CustomQuestion['type']
  return {
    key: doc.key ?? '',
    label: doc.label ?? '',
    type: type === 'longtext' || type === 'url' || type === 'select' ? type : 'text',
    options: doc.options,
    required: doc.required === true,
  }
}

function toCriterion(doc: CriterionDoc): Criterion {
  return {
    key: doc.key ?? '',
    label: doc.label ?? '',
    description: str(doc.description),
    // A zero weight is meaningful (a line shown but not counted), so only an
    // absent number falls back to 1.
    weight: typeof doc.weight === 'number' ? doc.weight : 1,
    max_score: typeof doc.maxScore === 'number' && doc.maxScore > 0 ? doc.maxScore : 5,
  }
}

export function toHackEvent(doc: EventDoc): HackEvent {
  // `tracks` is populated by EventRepository, but fall back gracefully to raw
  // ids so a non-populating endpoint does not blank the track filter.
  const tracks = (doc.tracks ?? [])
    .map((t) => (typeof t === 'string' ? null : toTrack(t)))
    .filter((t): t is Track => t !== null)

  return {
    id: doc._id ?? '',
    name: doc.name ?? 'Untitled event',
    tagline: str(doc.tagline),
    description: str(doc.description),
    // startsAt is optional on the model; falling back to createdAt keeps the
    // "has it started?" logic on the landing page from reading Invalid Date.
    starts_at: iso(doc.startsAt) ?? iso(doc.createdAt) ?? new Date().toISOString(),
    submissions_close: iso(doc.submissionsClose) ?? '',
    tracks,
    prizes: (doc.prizes ?? []).map(toPrize),
    custom_questions: (doc.customQuestions ?? []).map(toQuestion).filter((q) => q.key),
    criteria: (doc.criteria ?? []).map(toCriterion).filter((c) => c.key),
    min_team_size: doc.minTeamSize ?? 1,
    max_team_size: doc.maxTeamSize ?? 4,
    banner_url: str(doc.bannerUrl),
    judge_ids: (doc.judgeIds ?? []).map(refId).filter(Boolean),
  }
}

// --- Team ------------------------------------------------------------------

interface TeamDoc {
  _id?: string
  name?: string
  description?: string
  eventId?: Ref
  members?: Ref[]
  projectId?: Ref
}

export function toTeam(doc: TeamDoc): Team {
  const members = (doc.members ?? []).map((m) => ({
    id: refId(m),
    name: refField(m, 'name'),
    email: refField(m, 'email'),
  }))

  return {
    id: doc._id ?? '',
    name: doc.name ?? 'Untitled team',
    description: str(doc.description),
    event_id: refId(doc.eventId) || undefined,
    members,
    // Backend convention: the first member is the leader.
    leader_id: members[0]?.id,
    project_id: refId(doc.projectId) || null,
  }
}

// --- Project ---------------------------------------------------------------

interface ProjectDoc {
  _id?: string
  title?: string
  tagline?: string
  summary?: string
  description?: string
  thumbnailUrl?: string
  galleryUrls?: string[]
  demoVideoUrl?: string
  repoUrl?: string
  codeRepoLink?: string
  liveUrl?: string
  techTags?: string[]
  teamId?: Ref
  trackId?: Ref
  eventId?: Ref
  customAnswers?: Record<string, string>
  status?: string
  submittedAt?: string
}

export function toProject(doc: ProjectDoc): Project {
  return {
    id: doc._id ?? '',
    team: refField(doc.teamId, 'name') ?? 'Unknown team',
    team_id: refId(doc.teamId),
    track: refId(doc.trackId),
    track_name: refField(doc.trackId, 'topic'),
    event_id: refId(doc.eventId) || undefined,

    title: doc.title ?? 'Untitled',
    tagline: str(doc.tagline),
    summary: doc.summary ?? doc.tagline ?? '',
    description: str(doc.description),

    thumbnail_url: str(doc.thumbnailUrl),
    gallery_urls: list(doc.galleryUrls),
    demo_video_url: str(doc.demoVideoUrl),
    // repoUrl is canonical; codeRepoLink is the legacy duplicate.
    repo_url: doc.repoUrl ?? doc.codeRepoLink ?? '',
    live_url: str(doc.liveUrl),

    tags: list(doc.techTags),
    // A Mongoose Map serialises to a plain object, and is absent on old records.
    custom_answers: (doc.customAnswers ?? {}) as Record<string, string>,

    status: doc.status === 'submitted' ? 'submitted' : 'draft',
    submitted_at: iso(doc.submittedAt),
  }
}

/** App type -> the body the backend's allow-list accepts. */
export function fromProjectDraft(draft: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const map: Record<string, string> = {
    title: 'title',
    tagline: 'tagline',
    summary: 'summary',
    description: 'description',
    thumbnail_url: 'thumbnailUrl',
    gallery_urls: 'galleryUrls',
    demo_video_url: 'demoVideoUrl',
    repo_url: 'repoUrl',
    live_url: 'liveUrl',
    tags: 'techTags',
    track: 'trackId',
    custom_answers: 'customAnswers',
  }
  for (const [from, to] of Object.entries(map)) {
    if (draft[from] !== undefined) body[to] = draft[from]
  }
  return body
}

// --- Invite ----------------------------------------------------------------

interface InviteDoc {
  _id?: string
  token?: string
  teamId?: Ref
  expiresAt?: string
}

export function toInvite(doc: InviteDoc): Invite {
  return {
    id: doc._id ?? '',
    token: doc.token ?? '',
    team_id: refId(doc.teamId),
    team_name: refField(doc.teamId, 'name'),
    expires_at: iso(doc.expiresAt) ?? undefined,
  }
}

// --- Notification ----------------------------------------------------------

interface NotificationDoc {
  _id?: string
  type?: string
  message?: string
  isRead?: boolean
  createdAt?: string
  referenceToken?: string
}

export function toNotification(doc: NotificationDoc): Notification {
  return {
    id: doc._id ?? '',
    type: doc.type ?? 'system',
    message: doc.message ?? '',
    is_read: doc.isRead === true,
    created_at: iso(doc.createdAt) ?? new Date().toISOString(),
    reference_token: str(doc.referenceToken),
  }
}

/**
 * EventDraft -> the body the backend expects.
 *
 * Prizes and custom questions are whole-array replacements: the backend stores
 * them as subdocuments and `findByIdAndUpdate` overwrites the array, so the
 * organizer form always sends the complete list rather than a patch.
 */
export function fromEventDraft(draft: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const map: Record<string, string> = {
    name: 'name',
    tagline: 'tagline',
    description: 'description',
    starts_at: 'startsAt',
    submissions_close: 'submissionsClose',
    min_team_size: 'minTeamSize',
    max_team_size: 'maxTeamSize',
    banner_url: 'bannerUrl',
    is_featured: 'isFeatured',
  }
  for (const [from, to] of Object.entries(map)) {
    if (draft[from] !== undefined) body[to] = draft[from]
  }

  if (Array.isArray(draft.prizes)) {
    body.prizes = (draft.prizes as Array<Record<string, unknown>>).map((p) => ({
      name: p.name,
      amountUsd: p.amount_usd ?? 0,
      description: p.description || undefined,
      // An empty string from a <select> means "overall prize", not a track.
      trackId: p.track ? p.track : null,
    }))
  }

  if (Array.isArray(draft.criteria)) {
    body.criteria = (draft.criteria as Array<Record<string, unknown>>).map((c) => ({
      key: c.key,
      label: c.label,
      description: c.description || undefined,
      weight: c.weight ?? 1,
      maxScore: c.max_score ?? 5,
    }))
  }

  if (Array.isArray(draft.custom_questions)) {
    body.customQuestions = (draft.custom_questions as Array<Record<string, unknown>>).map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type ?? 'text',
      options: q.options ?? [],
      required: q.required === true,
    }))
  }

  return body
}

// --- Ballot ----------------------------------------------------------------

interface BallotDoc {
  _id?: string
  judgeId?: Ref
  projectId?: Ref
  eventId?: Ref
  scores?: Record<string, number>
  comment?: string
  updatedAt?: string
}

export function toBallot(doc: BallotDoc): Ballot {
  // Mongoose serialises a Map to a plain object; guard anyway, because an old
  // record written before the rubric existed can have none at all.
  const raw = (doc.scores ?? {}) as Record<string, unknown>
  const scores: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number') scores[key] = value
  }

  return {
    id: doc._id ?? '',
    judge_id: refId(doc.judgeId),
    judge_name: refField(doc.judgeId, 'name'),
    project_id: refId(doc.projectId),
    event_id: refId(doc.eventId),
    scores,
    comment: doc.comment ?? '',
    updated_at: iso(doc.updatedAt),
  }
}

// --- Standings -------------------------------------------------------------

interface StandingRowDoc {
  projectId?: string
  title?: string
  teamId?: string
  teamName?: string | null
  trackId?: string | null
  trackName?: string | null
  ballotCount?: number
  assignedCount?: number
  weightedScore?: number | null
  normalizedScore?: number | null
  correctedBallots?: number
  rank?: number | null
  trackRank?: number | null
  perCriterion?: Record<string, number | null>
}

interface JudgeProgressDoc {
  judgeId?: string
  name?: string | null
  email?: string | null
  ballotCount?: number
  assignedCount?: number
  assignedDone?: number
  meanScore?: number | null
  spread?: number | null
  corrected?: boolean
  uncorrectedReason?: string | null
}

interface StandingsDoc {
  eventId?: string
  eventName?: string
  method?: string
  criteria?: CriterionDoc[]
  standings?: StandingRowDoc[]
  normalization?: { groups?: number; correctedBallots?: number; ballots?: number }
  progress?: {
    projectCount?: number
    scoredProjectCount?: number
    unscoredProjectCount?: number
    ballotCount?: number
    assignmentCount?: number
    judges?: JudgeProgressDoc[]
  }
  computedAt?: string
}

/** A number, or null -- never a silent 0. */
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/**
 * `null` rather than `0` on both scores and both ranks: null means no judge
 * has scored this entry, and collapsing that to zero would put an unjudged team
 * at the bottom of the table as though it had competed and lost.
 */
function toStandingRow(doc: StandingRowDoc): StandingRow {
  return {
    project_id: doc.projectId ?? '',
    title: doc.title ?? 'Untitled',
    team_id: doc.teamId ?? '',
    team_name: doc.teamName ?? null,
    track_id: doc.trackId ?? null,
    track_name: doc.trackName ?? null,
    ballot_count: doc.ballotCount ?? 0,
    assigned_count: doc.assignedCount ?? 0,
    weighted_score: num(doc.weightedScore),
    normalized_score: num(doc.normalizedScore),
    corrected_ballots: doc.correctedBallots ?? 0,
    rank: num(doc.rank),
    track_rank: num(doc.trackRank),
    per_criterion: doc.perCriterion ?? {},
  }
}

function toJudgeProgress(doc: JudgeProgressDoc): JudgeProgress {
  const reason = doc.uncorrectedReason
  return {
    judge_id: doc.judgeId ?? '',
    name: doc.name ?? null,
    email: doc.email ?? null,
    ballot_count: doc.ballotCount ?? 0,
    assigned_count: doc.assignedCount ?? 0,
    assigned_done: doc.assignedDone ?? 0,
    mean_score: num(doc.meanScore),
    spread: num(doc.spread),
    corrected: doc.corrected === true,
    uncorrected_reason: reason === 'too-few-ballots' || reason === 'no-peers' ? reason : null,
  }
}

export function toStandings(doc: StandingsDoc): Standings {
  const progress = doc.progress ?? {}
  const norm = doc.normalization ?? {}
  return {
    event_id: doc.eventId ?? '',
    event_name: doc.eventName ?? '',
    method: doc.method === 'raw' ? 'raw' : 'normalized',
    criteria: (doc.criteria ?? []).map(toCriterion).filter((c) => c.key),
    standings: (doc.standings ?? []).map(toStandingRow),
    normalization: {
      groups: norm.groups ?? 0,
      corrected_ballots: norm.correctedBallots ?? 0,
      ballots: norm.ballots ?? 0,
    },
    progress: {
      project_count: progress.projectCount ?? 0,
      scored_project_count: progress.scoredProjectCount ?? 0,
      unscored_project_count: progress.unscoredProjectCount ?? 0,
      ballot_count: progress.ballotCount ?? 0,
      assignment_count: progress.assignmentCount ?? 0,
      judges: (progress.judges ?? []).map(toJudgeProgress),
    },
    computed_at: iso(doc.computedAt) ?? new Date().toISOString(),
  }
}

// --- Judging queue and assignments -----------------------------------------

export function toJudgeQueue(doc: { mode?: string; projects?: ProjectDoc[] }): JudgeQueue {
  const mode = doc.mode === 'assigned' || doc.mode === 'tracks' ? doc.mode : 'all'
  return { mode, projects: (doc.projects ?? []).map(toProject) }
}

interface AssignmentDoc {
  _id?: string
  judgeId?: string
  judgeName?: string | null
  judgeEmail?: string | null
  projectId?: string
  projectTitle?: string | null
  trackName?: string | null
  source?: string
  scored?: boolean
}

export function toAssignment(doc: AssignmentDoc): Assignment {
  const source = doc.source === 'manual' || doc.source === 'ballot' ? doc.source : 'auto'
  return {
    id: doc._id ?? '',
    judge_id: doc.judgeId ?? '',
    judge_name: doc.judgeName ?? null,
    judge_email: doc.judgeEmail ?? null,
    project_id: doc.projectId ?? '',
    project_title: doc.projectTitle ?? null,
    track_name: doc.trackName ?? null,
    source,
    scored: doc.scored === true,
  }
}

interface AssignmentRunDoc {
  reviewsPerProject?: number
  dealt?: number
  adopted?: number
  total?: number
  shortfall?: Array<{ projectId?: string; title?: string; trackName?: string | null; assigned?: number; wanted?: number; eligibleJudges?: number }>
  perJudge?: Array<{ judgeId?: string; name?: string | null; email?: string | null; assigned?: number }>
}

export function toAssignmentRun(doc: AssignmentRunDoc): AssignmentRun {
  return {
    reviews_per_project: doc.reviewsPerProject ?? 0,
    dealt: doc.dealt ?? 0,
    adopted: doc.adopted ?? 0,
    total: doc.total ?? 0,
    shortfall: (doc.shortfall ?? []).map((s) => ({
      project_id: s.projectId ?? '',
      title: s.title ?? 'Untitled',
      track_name: s.trackName ?? null,
      assigned: s.assigned ?? 0,
      wanted: s.wanted ?? 0,
      eligible_judges: s.eligibleJudges ?? 0,
    })),
    per_judge: (doc.perJudge ?? []).map((j) => ({
      judge_id: j.judgeId ?? '',
      name: j.name ?? null,
      email: j.email ?? null,
      assigned: j.assigned ?? 0,
    })),
  }
}

// --- Judge invites ---------------------------------------------------------

const inviteStatus = (value: unknown): JudgeInviteStatus =>
  value === 'accepted' || value === 'expired' || value === 'revoked' ? value : 'pending'

export function toJudgeInvite(doc: {
  _id?: string
  trackId?: Ref
  email?: string
  token?: string
  status?: string
  expiresAt?: string
  acceptedAt?: string
}): JudgeInvite {
  return {
    id: doc._id ?? '',
    track_id: refId(doc.trackId),
    email: doc.email ?? '',
    token: doc.token ?? '',
    status: inviteStatus(doc.status),
    expires_at: iso(doc.expiresAt),
    accepted_at: iso(doc.acceptedAt),
  }
}

export function toJudgeInvitePreview(doc: {
  eventId?: Ref
  eventName?: string | null
  trackName?: string | null
  emailHint?: string
  status?: string
  expiresAt?: string
}): JudgeInvitePreview {
  return {
    event_id: refId(doc.eventId),
    event_name: doc.eventName ?? null,
    track_name: doc.trackName ?? null,
    email_hint: doc.emailHint ?? '',
    status: inviteStatus(doc.status),
    expires_at: iso(doc.expiresAt),
  }
}
