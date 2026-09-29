/**
 * About — the bento grid of stat cards (judges, correctness weight, prize pool,
 * reviews per project) introducing what Verdikt is.
 */
import type { HackEvent } from '../api'
import { AvatarStack, Card, Container, CountUp, IconBubble, Reveal, SectionLabel } from '../ui'

export function About({ event, judges }: { event?: HackEvent; judges?: number }) {
  const pool = event?.prizes.reduce((s, p) => s + p.amount_usd, 0) || 2500

  return (
    <section id="about" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <Reveal className="flex flex-col items-center text-center">
          <SectionLabel>About Verdikt</SectionLabel>
          <h2 className="headline mt-6 max-w-[21ch] text-[clamp(2rem,4.8vw,3.5rem)]">
            An open judging platform that makes every <IconBubble icon="shield" /> score fair and every{' '}
            <span className="text-blue">
              <IconBubble icon="scale" tone="blue" /> result easy to defend
            </span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {/* Blue block with the judge count */}
          <Reveal>
            <Card tone="blue" tilt className="flex min-h-[340px] flex-col justify-between p-5">
              <div className="relative flex items-center justify-between">
                <span className="text-lg font-semibold tracking-[-0.04em]">Judging</span>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-paper text-ink">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path d="M6 20V11M12 20V5M18 20v-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
              <div className="relative rounded-[18px] bg-paper p-5 text-ink">
                <div className="text-[3.2rem] font-normal leading-none tracking-[-0.05em]">
                  <CountUp value={judges ?? 36} />
                </div>
                <p className="mt-3 text-sm text-muted">Senior engineers and architects on the judging panel, three reviews per project.</p>
              </div>
            </Card>
          </Reveal>

          {/* Quote card */}
          <Reveal delay={80}>
            <Card tone="fog" interactive className="flex min-h-[340px] flex-col p-6">
              <span className="text-sm text-muted">Scoring weight on correctness</span>
              <div className="mt-2 text-[3.2rem] leading-none tracking-[-0.05em]">
                <CountUp value={40} />%
              </div>
              <div className="mt-auto">
                <AvatarStack names={['Ada Park', 'Sam Ruiz', 'Lee Moss', 'Kai Obi', 'Mo Diaz', 'Ivy Chen']} max={4} />
                <p className="mt-4 text-[1.02rem] leading-snug tracking-tight">
                  “A clean, correct build scores above a flashy broken one every time.”
                </p>
                <p className="mt-2 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-subtle">Event organizers</p>
              </div>
            </Card>
          </Reveal>

          {/* Yellow + ink stack */}
          <div className="flex flex-col gap-4">
            <Reveal delay={160} className="flex-1">
              <Card tone="yellow" interactive className="flex h-full min-h-[200px] flex-col p-6">
                <span className="text-sm">Prize pool</span>
                <div className="mt-2 text-[3.2rem] leading-none tracking-[-0.05em]">
                  $<CountUp value={pool} />
                </div>
                <p className="mt-auto pt-6 text-sm">Set by each organizer, awarded across tracks and overall places.</p>
              </Card>
            </Reveal>
            <Reveal delay={240}>
              <Card tone="ink" interactive className="flex items-center justify-between gap-4 p-6">
                <span className="text-sm text-white/70">Reviews per project</span>
                <span className="tnum font-mono text-[1.6rem] tracking-tight text-yellow">3</span>
              </Card>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  )
}
