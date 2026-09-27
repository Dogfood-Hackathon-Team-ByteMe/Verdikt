// Static copy for the featured event (DOGFOOD 2026), taken from dogfoodhack.com.
// Event-specific data that the backend doesn't serve yet lives here, apart from components.

export const judgeCompanies = ['Microsoft', 'Amazon', 'Meta', 'Adobe', 'GoDaddy', 'Walmart', 'Wise', 'ChargePoint', 'T-Bank', 'Avito']

/**
 * `status` is the one thing here that goes stale if nobody updates it, so
 * keep it in step with the claim in `.dogfood.toml` -- that file, plus
 * `acceptance-report.txt`, is what actually proves it.
 *   done       shipped and tested; claimed in .dogfood.toml
 *   building   in progress right now
 *   planned    not started
 */
export type TierStatus = 'done' | 'building' | 'planned'

export const tiers: { id: string; name: string; note: string; status: TierStatus; features: string[] }[] = [
  {
    id: 'T1',
    name: 'Core',
    note: 'Required to be judged',
    status: 'done',
    features: ['Sign-in and sessions', 'Five roles, visitor to admin', 'Events with dates, tracks, prizes', 'Teams by invite link', 'Drafts editable until the deadline', 'Deadline enforced on the server', 'Public gallery with search'],
  },
  {
    id: 'T2',
    name: 'Judging',
    note: 'Where the real engineering starts',
    status: 'done',
    features: ['Judge invites and batch assignment', 'Weighted rubric set by organizers', 'Role isolation in the backend', 'Live organizer dashboard', 'Cross-judge normalization', 'CSV export at every stage'],
  },
  {
    id: 'T3',
    name: 'Public',
    note: 'Let the crowd in, safely',
    status: 'planned',
    features: ['Community voting modes', 'Comments on projects', 'Results hidden while voting', 'Randomized project order', 'Rate limits and audit trail'],
  },
  {
    id: 'T4',
    name: 'Stretch',
    note: 'For teams with time left',
    status: 'planned',
    features: ['REST API and webhooks', 'Certificates and records', 'Signed judge participation', 'Embeddable gallery widget', 'Bulk import and export'],
  },
]

export const criteria = [
  { name: 'Tier completion and correctness', weight: 40 },
  { name: 'Judging integrity', weight: 25 },
  { name: 'Adoptability and operability', weight: 20 },
  { name: 'Code quality and innovation', weight: 15 },
]

export interface TimelineItem {
  at: string // ISO UTC
  title: string
  detail?: string
}

export const timeline: { phase: string; items: TimelineItem[] }[] = [
  {
    phase: 'Before',
    items: [
      { at: '2026-08-24T00:00:00Z', title: 'Registration opens', detail: 'Discord goes live' },
      { at: '2026-09-04T00:00:00Z', title: 'Judging panel announced' },
      { at: '2026-09-21T00:00:00Z', title: 'Team formation deadline' },
      { at: '2026-09-24T00:00:00Z', title: 'Spec published', detail: 'Planning only, no code yet' },
    ],
  },
  {
    phase: '72 hours',
    items: [
      { at: '2026-09-25T18:00:00Z', title: 'Kickoff', detail: 'Fixtures and acceptance suite released' },
      { at: '2026-09-28T18:00:00Z', title: 'Code freeze', detail: 'Submissions due' },
    ],
  },
  {
    phase: 'After',
    items: [
      { at: '2026-09-29T00:00:00Z', title: 'Judging window opens', detail: '3 independent reviews per project' },
      { at: '2026-10-05T18:00:00Z', title: 'Write-up quest closes' },
      { at: '2026-10-09T00:00:00Z', title: 'Winners announced', detail: 'Plus the adoption decision' },
    ],
  },
]

export const faq = [
  {
    q: 'What is Verdikt?',
    a: 'An open-source portal for running hackathons end to end: event setup, teams, submissions, a public gallery, and judging that you can explain afterwards. It is our entry for DOGFOOD 2026.',
  },
  {
    q: 'Can I run it myself?',
    a: 'Yes. Clone the repo and run docker compose up. It starts with seeded data, needs no cloud account, and keeps working with the network off.',
  },
  {
    q: 'How do judges stay independent?',
    a: 'The backend decides what each role can read. A judge only ever receives their own scores, and a track judge cannot open other tracks. Hiding buttons in the page is never the only lock.',
  },
  {
    q: 'What happens at the deadline?',
    a: 'Drafts are editable right up to the submission close time. After it, the server rejects new or edited submissions, whatever the browser sends.',
  },
  {
    q: 'How are scores combined?',
    a: 'Each criterion is weighted by the organizer. Scores are then normalized per judge, so a strict judge and a generous judge count the same, and the method is written down in JUDGING.md.',
  },
  {
    q: 'Can visitors see scores?',
    a: 'No. Visitors and participants can browse every project, but scores and rankings are visible only to the organizers of the event, and each judge sees only their own ballots.',
  },
]
