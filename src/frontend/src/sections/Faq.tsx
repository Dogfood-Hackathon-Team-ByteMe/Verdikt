/**
 * Faq — question accordion beside a short intro and a Discord link.
 * Questions live in content/landing.ts.
 */
import { faq } from '../content/landing'
import { Accordion, Button, Container, Reveal, SectionLabel } from '../ui'

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="headline mt-6 text-[clamp(2rem,4.6vw,3.4rem)]">
            Questions, <span className="text-subtle">answered.</span>
          </h2>
          <p className="mt-5 max-w-sm text-muted">Something else? Browse the events, or start your own from the dashboard.</p>
          <Button href="/events" variant="dark" icon="arrowRight" className="mt-8">
            Browse events
          </Button>
        </Reveal>
        <Reveal className="lg:col-span-3" delay={100}>
          <Accordion items={faq} />
        </Reveal>
      </Container>
    </section>
  )
}
