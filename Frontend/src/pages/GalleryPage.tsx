/**
 * GalleryPage — /gallery. The public project list on its own page, so it can
 * be linked and shared without scrolling the landing page.
 *
 * Reuses the Gallery section rather than duplicating the search and filter
 * logic; the only difference is the chrome around it.
 */
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { Gallery } from '../sections/Gallery'
import { AppShell } from '../sections/AppShell'

export default function GalleryPage() {
  const event = useApi(() => api.getFeaturedEvent())

  return (
    <AppShell>
      <Gallery tracks={event.data?.tracks ?? []} />
    </AppShell>
  )
}
