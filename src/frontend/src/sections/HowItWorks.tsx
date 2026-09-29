/**
 * HowItWorks — the five lifecycle steps from event creation to publishing.
 * Highlights whichever step the event is currently in, based on its dates.
 */
import type { HackEvent } from '../api'
import { Card, Icon, Reveal, Section, SectionHeading, cn, type IconName } from '../ui'

const STEPS: { title: string; who: string; body: string; icon: IconName }[] = [
  { title: 'Create the event', who: 'Organizer', body: 'Dates, tracks, prizes and a weighted rubric.', icon: 'spark' },
  { title: 'Form teams', who: 'Participants', body: 'Share an invite link. Up to four people join.', icon: 'users' },
  { title: 'Submit', who: 'Participants', body: 'Drafts save as you go. The deadline is enforced on the server.', icon: 'bolt' },
  { title: 'Judge', who: 'Judges', body: 'Batches assigned, scored blind, never a peer ballot in sight.', icon: 'shield' },
  { title: 'Publish', who: 'Organizer', body: 'Normalized, checked, released with a full audit trail.', icon: 'trophy' },
]

function liveStep(event?: HackEvent) {
  if (!event) return -1
  const now = Date.now()
  if (now < Date.parse(event.starts_at)) return 1
  if (now < Date.parse(event.submissions_close)) return 2
  return 3
}

export function HowItWorks({ event }: { event?: HackEvent }) {
  const live = liveStep(event)
  return (
    <Section id="how">
      <SectionHeading label="How it works" title="From kickoff to verdict" tail="in five steps." />
      <ol className="relative mt-14 grid gap-4 md:grid-cols-5">
        {STEPS.map((s, i) => {
          const isLive = i === live
          const done = i < live
          return (
            <Reveal as="li" key={s.title} delay={i * 70}>
              <Card tone={isLive ? 'ink' : 'fog'} interactive className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className={cn('grid h-10 w-10 place-items-center rounded-full', isLive ? 'bg-yellow text-on-bright' : done ? 'bg-slab text-yellow' : 'bg-paper text-ink')}>
                    <Icon name={done ? 'check' : s.icon} size={17} strokeWidth={2} />
                  </span>
                  <span className={cn('font-mono text-[0.7rem]', isLive ? 'opacity-60' : 'text-subtle')}>0{i + 1}</span>
                </div>
                <h3 className="mt-8 text-[1.2rem] font-medium tracking-[-0.03em]">{s.title}</h3>
                <p className={cn('mt-1 font-mono text-[0.64rem] uppercase tracking-[0.12em]', isLive ? 'text-yellow' : 'text-subtle')}>
                  {isLive ? 'Happening now' : s.who}
                </p>
                <p className={cn('mt-3 text-sm', isLive ? 'opacity-75' : 'text-muted')}>{s.body}</p>
              </Card>
            </Reveal>
          )
        })}
      </ol>
    </Section>
  )
}
