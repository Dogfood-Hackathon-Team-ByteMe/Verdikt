/**
 * UiKit — living reference for the whole component kit, shown at #ui-kit.
 * Every future page should be assembled from these pieces and the design tokens,
 * so this page is the place to see what's available.
 */
import { useState, type ReactNode } from 'react'
import {
  Accordion,
  AvatarStack,
  Badge,
  Button,
  Card,
  Chip,
  Container,
  CountUp,
  IconBubble,
  Logo,
  Marquee,
  Panel,
  SearchField,
  SectionHeading,
  SectionLabel,
  Segmented,
  ThemeToggle,
} from '../ui'

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t-2 border-ink py-8">
      <div className="label-mono mb-5 text-red">// {title}</div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

const swatches: [string, string][] = [
  ['ink', '#16150f'],
  ['cream', '#faf8f2'],
  ['fog', '#f0eee5'],
  ['line', '#e4e1d5'],
  ['blue', '#1f3ae0'],
  ['blue-mist', '#e4e8ff'],
  ['yellow', '#ffd23f'],
  ['red', '#ff4b3e'],
  ['green', '#1fa463'],
]

export default function UiKit() {
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one')
  const [chip, setChip] = useState('All')

  return (
    <div className="pb-24">
      <Container className="flex items-center justify-between py-6">
        <Logo />
        <Button variant="outline" size="sm" onClick={() => { window.location.hash = '' }}>
          Back to site
        </Button>
      </Container>
      <Container>
        <SectionHeading label="Verdikt UI kit" title="Components" tail="for every page we build next." align="left" />

        <Row title="Theme">
          <p className="max-w-xl font-mono text-[0.9rem] text-muted">
            The toggle in the nav switches light and dark. With no explicit choice the page follows the operating
            system. Style everything through the tokens below and both themes come for free.
          </p>
          <ThemeToggle />
        </Row>

        <Row title="Colours">
          {swatches.map(([name, hex]) => (
            <div key={name} className="w-28">
              <div className="h-16 rounded-card ring-1 ring-ink" style={{ background: hex }} />
              <div className="mt-2 font-mono text-[0.8rem] font-bold">{name}</div>
              <div className="font-mono text-[0.68rem] text-subtle">{hex}</div>
            </div>
          ))}
        </Row>

        <Row title="Type">
          <div className="flex w-full flex-col gap-3">
            <div className="headline text-5xl">
              Headline, Space Grotesk bold <span className="text-blue">with a blue tail</span>
            </div>
            <p className="max-w-xl font-mono text-[0.92rem] text-muted">
              Body copy is Space Mono, 15px. Monospace throughout keeps the developer-notebook feel.
            </p>
            <SectionLabel>Section label</SectionLabel>
          </div>
        </Row>

        <Row title="Buttons">
          <Button icon="arrowRight">Primary</Button>
          <Button variant="blue" icon="arrowRight">Blue</Button>
          <Button variant="dark">Dark</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button size="lg" icon="arrowRight" magnetic>Large magnetic</Button>
          <Button disabled>Disabled</Button>
        </Row>

        <Row title="On a panel">
          <Panel className="w-full p-8">
            <div className="flex flex-wrap items-center gap-3">
              <Button icon="arrowRight">Primary</Button>
              <Button variant="dark">Dark</Button>
              <Badge variant="yellow" dot>Live</Badge>
            </div>
          </Panel>
        </Row>

        <Row title="Badges">
          <Badge variant="yellow" dot>Building now</Badge>
          <Badge variant="ink">Ink</Badge>
          <Badge variant="blue">Blue</Badge>
          <Badge variant="red">Red</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Submitted</Badge>
          <Badge variant="danger">Closed</Badge>
        </Row>

        <Row title="Inputs and filters">
          <SearchField id="kit-search" label="Search" placeholder="Search entries" className="w-full max-w-sm" />
          {['All', 'Infrastructure', 'Security'].map((c) => (
            <Chip key={c} active={chip === c} onClick={() => setChip(c)} count={c.length}>
              {c}
            </Chip>
          ))}
          <Segmented
            label="Example"
            options={[{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }, { id: 'three', label: 'Three' }]}
            value={tab}
            onChange={setTab}
          />
        </Row>

        <Row title="Cards (hover them)">
          <div className="grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(['paper', 'fog', 'yellow', 'ink', 'blue', 'red', 'green', 'cream', 'outline'] as const).map((t) => (
              <Card key={t} tone={t} tilt className="flex h-40 flex-col justify-between p-5">
                <span className="font-mono text-[0.75rem] opacity-70">{t}</span>
                <span className="headline text-4xl">
                  <CountUp value={520} />k
                </span>
              </Card>
            ))}
          </div>
        </Row>

        <Row title="Misc">
          <AvatarStack names={['Ada Park', 'Sam Ruiz', 'Lee Moss', 'Kai Obi', 'Mo Diaz']} />
          <span className="headline text-4xl">
            Inline <IconBubble icon="shield" /> icons <IconBubble icon="bolt" tone="yellow" />
          </span>
        </Row>

        <Row title="Marquee">
          <Marquee className="w-full" duration={20}>
            {['One', 'Two', 'Three', 'Four', 'Five'].map((w) => (
              <span key={w} className="px-8 font-mono text-xl text-subtle">
                {w}
              </span>
            ))}
          </Marquee>
        </Row>

        <Row title="Accordion">
          <div className="w-full max-w-2xl">
            <Accordion items={[{ q: 'First question', a: 'Answer text.' }, { q: 'Second question', a: 'Another answer.' }]} />
          </div>
        </Row>
      </Container>
    </div>
  )
}
