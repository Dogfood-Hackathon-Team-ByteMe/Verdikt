/**
 * Scrolls to the top on navigation, which a single-page app does not do by
 * itself. Skipped when the URL carries a hash, so the landing page's in-page
 * anchors (#gallery, #prizes) still jump where they should.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return
    window.scrollTo(0, 0)
  }, [pathname, hash])

  return null
}
