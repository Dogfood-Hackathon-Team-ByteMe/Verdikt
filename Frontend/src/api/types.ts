// Shapes follow the DOGFOOD Tier 1 spec field names (snake_case). The backend
// speaks Mongo (camelCase, `_id`, populated refs); src/api/adapters.ts is the
// single place that translation happens, so nothing below leaks into the UI.

export type Role = 'visitor' | 'participant' | 'judge' | 'organizer' | 'admin'

export interface Track {
  id: string
  name: string
  description?: string
  event_id?: string
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
  min_team_size: number
  max_team_size: number
  /** Banner image. `/api/images/<id>` for an upload, or any URL. */
  banner_url?: string
  /**
   * User ids of the event's judges. Carried so the UI can tell someone they
   * may not enter *before* they click; the server enforces it either way.
   */
  judge_ids: string[]
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
  is_featured?: boolean
}
