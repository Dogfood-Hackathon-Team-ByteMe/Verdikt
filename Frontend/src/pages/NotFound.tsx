/**
 * NotFound — the catch-all route. Kept in the site's voice rather than a bare
 * "404", and always offers a way onward.
 */
import { AppShell, PageHeading } from '../sections/AppShell'
import { Button, Container } from '../ui'

export default function NotFound() {
  return (
    <AppShell>
      <Container className="py-24">
        <PageHeading label="404" title="Nothing" tail="here.">
          That page does not exist. It may have moved, or the link may be wrong.
        </PageHeading>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/" icon="arrowRight">Event page</Button>
          <Button href="/gallery" variant="outline">Browse the gallery</Button>
        </div>
      </Container>
    </AppShell>
  )
}
