/**
 * Faq — question accordion beside a short intro and a Discord link.
 * Questions live in content/dogfood.ts.
 */
import { faq } from '../content/dogfood'
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
          <p className="mt-5 max-w-sm text-muted">Something else? Ask the team on the DOGFOOD Discord.</p>
          <Button href="https://discord.gg/xfYPDZYqeh" target="_blank" rel="noreferrer" variant="dark" icon="arrowUpRight" className="mt-8">
            Go to Discord
          </Button>
        </Reveal>
        <Reveal className="lg:col-span-3" delay={100}>
          <Accordion items={faq} />
        </Reveal>
      </Container>
    </section>
  )
}
