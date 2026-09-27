/**
 * Hero — MLH-style opener on the graph-paper ground: a bold headline and mono
 * subtext with the two CTAs on the left, the isometric tier illustration on the
 * right, and the figures row (Stats) underneath. The headline rises word by word.
 */
import type { HackEvent } from '../api'
import { pad, useCountdown } from '../hooks/useCountdown'
import { Badge, Button, Container } from '../ui'
import { Isometric } from './Isometric'
import { Stats } from './Stats'

function Words({ text, start = 0, className }: { text: string; start?: number; className?: string }) {
  return (
    <span className={className}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="rise-word" style={{ animationDelay: `${start + i * 65}ms` }}>
          {w}&nbsp;
        </span>
      ))}
    </span>
  )
}

export function Hero({ event, judges }: { event?: HackEvent; judges?: number }) {
  const c = useCountdown(event?.submissions_close)

  return (
    <div id="top">
      <Container className="grid items-center gap-10 pb-6 pt-28 sm:pt-36 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-7">
          {event && (
            <Badge variant="yellow" dot className="rise-word">
              {event.name} · Online ·{' '}
              {c.closed ? 'Closed' : <span className="tnum">{pad(c.days)}d {pad(c.hours)}h {pad(c.minutes)}m left</span>}
            </Badge>
          )}

          <h1 className="headline mt-6 text-[clamp(2.6rem,7vw,5.2rem)]">
            <Words text="Judge every" start={100} />
            <br />
            <Words text="build" start={280} className="text-blue" />
            <Words text="fairly." start={380} />
          </h1>

          <p className="mt-6 max-w-[34rem] font-mono text-[0.95rem] leading-relaxed text-muted">
            Verdikt is an open, self-hostable portal for hackathon submissions and judging. Teams submit until the
            deadline, judges score blind against a weighted rubric, and organizers publish results they can defend.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button href="#host" size="lg" icon="arrowRight" magnetic>
              Host an event
            </Button>
            <Button href="#gallery" variant="outline" size="lg">
              View the gallery
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[0.72rem] text-subtle">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green" /> MIT licensed
            </span>
            <span className="text-ink">docker compose up</span>
            <span>Runs with the network off</span>
          </div>
        </div>

        <div className="lg:col-span-5">
          <Isometric className="mx-auto max-w-[400px]" />
        </div>
      </Container>

      <Stats event={event} judges={judges} />
    </div>
  )
}
