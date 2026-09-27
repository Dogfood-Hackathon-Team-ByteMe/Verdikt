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
import type { CustomQuestion, HackEvent, Invite, Notification, Prize, Project, Team, Track } from './types'

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
}

export function toTrack(doc: TrackDoc): Track {
  return {
    id: doc._id ?? '',
    // The backend calls it `topic`; the UI calls every one of these a name.
    name: doc.topic ?? 'Untitled track',
    description: str(doc.description),
    event_id: refId(doc.eventId) || undefined,
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
