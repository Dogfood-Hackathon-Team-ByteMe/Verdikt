/**
 * Landing — the public marketing page for the platform.
 *
 * Loads the featured event and the derived stats once and passes them down;
 * every section below is presentational. Visiting #ui-kit still swaps the page
 * for the component showcase, which predates the router.
 */
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import UiKit from './UiKit'
import { About } from '../sections/About'
import { Faq } from '../sections/Faq'
import { Footer } from '../sections/Footer'
import { Hero } from '../sections/Hero'
import { HowItWorks } from '../sections/HowItWorks'
import { Nav } from '../sections/Nav'
import { Roles } from '../sections/Roles'
import { Scoring } from '../sections/Scoring'

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export default function Landing() {
  const hash = useHash()
  const event = useApi(() => api.getFeaturedEvent())
  const stats = useApi(() => api.getStats())

  if (hash === '#ui-kit') return <UiKit />

  return (
    <>
      <Nav />
      <main>
        <Hero event={event.data} stats={stats.data} />
        <About event={event.data} judges={stats.data?.judges} />
        <HowItWorks event={event.data} />
        <Scoring />
        <Roles />
        <Faq />
      </main>
      <Footer />
    </>
  )
}
