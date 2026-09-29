/**
 * ProjectsPage — /projects. The public project list on its own page, so it can
 * be linked and shared without scrolling the landing page.
 *
 * Reuses the Gallery section rather than duplicating the search and filter
 * logic; the only difference is the chrome around it.
 *
 * `?event=<id>` narrows to one event -- that is the link the Events tab sends.
 * Without it the page shows every event's work, which is what someone clicking
 * "Projects" in the nav expects.
 */
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { Gallery } from '../sections/Gallery'
import { AppShell } from '../sections/AppShell'

export default function ProjectsPage() {
  const [params] = useSearchParams()
  const eventId = params.get('event') ?? undefined

  // Track chips need the tracks of whichever event is in view. With no event
  // pinned, the featured one supplies them.
  const featured = useApi(() => api.getFeaturedEvent())
  const scoped = useApi(() => (eventId ? api.getEvent(eventId) : Promise.resolve(null)), [eventId])
  const tracks = (eventId ? scoped.data?.tracks : featured.data?.tracks) ?? []

  return (
    <AppShell>
      <Gallery tracks={tracks} eventId={eventId} />
    </AppShell>
  )
}
