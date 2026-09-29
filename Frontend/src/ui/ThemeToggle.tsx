/**
 * Theme switching, in two shapes.
 *
 * The theme is an explicit `data-theme` attribute on <html>; with no attribute
 * the page follows the operating system (see the dark blocks in index.css).
 * The choice is saved in localStorage and re-applied before first paint by the
 * small script in index.html, so there's no flash of the wrong theme.
 *
 *   useTheme()    the state, shared by both controls
 *   ThemeCord     the pull-cord hanging off the wordmark (what the header uses)
 *   ThemeToggle   the plain square button, for anywhere a cord would not hang
 */
import { useEffect, useState } from 'react'
import { cn } from './cn'
import { Icon } from './Icon'

const KEY = 'verdikt-theme'
type Theme = 'light' | 'dark'

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    // Storage can be blocked (private windows); fall back to the OS setting.
    return null
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  // Read the real theme once mounted (the server-rendered default is 'light').
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) || savedTheme() || systemTheme())
  }, [])

  // Follow the OS while the viewer hasn't made a choice of their own.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = () => {
      if (!savedTheme()) setTheme(mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Not being able to remember the choice shouldn't break the toggle.
    }
  }

  return { theme, toggle, dark: theme === 'dark' }
}

/** The sun/moon pair, cross-fading in one grid cell. */
function ThemeIcons({ dark, size = 18 }: { dark: boolean; size?: number }) {
  return (
    <span className="relative grid place-items-center" style={{ height: size, width: size }}>
      <Icon
        name="sun"
        size={size}
        strokeWidth={2.1}
        className={cn(
          'col-start-1 row-start-1 transition-all duration-300 ease-spring',
          dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
      <Icon
        name="moon"
        size={size - 1}
        strokeWidth={2.1}
        className={cn(
          'col-start-1 row-start-1 transition-all duration-300 ease-spring',
          dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
    </span>
  )
}

/**
 * ThemeCord — a pull-cord dangling off the end of the wordmark.
 *
 * It hangs *below* the header bar, which is the whole idea, so it is kept
 * deliberately short: cord plus bob comes to 38px, and every page's content
 * starts at least 48px below the header, so it never lands on a heading.
 * The positioning wrapper owns the horizontal centring and the bob owns the
 * rotation, because one element cannot both be translated and swung without
 * the two transforms fighting.
 */
export function ThemeCord({ className, solid = true }: { className?: string; solid?: boolean }) {
  const { dark, toggle } = useTheme()
  const [yanking, setYanking] = useState(false)

  return (
    <span
      className={cn('pointer-events-none absolute top-full z-40 flex flex-col items-center', className)}
      aria-hidden={false}
    >
      {/* The housing hangs the cord off the bar as a tab. It matters that it
          is opaque: the header floats over the page, so without it the bob
          lands on whatever text happens to be scrolling underneath. On a
          header that is itself transparent (the landing page before it is
          scrolled) the housing drops away too, rather than being a lone box
          floating over the hero. */}
      <span
        className={cn(
          'pointer-events-auto flex flex-col items-center px-1.5 pb-1.5',
          solid && 'rounded-b-btn border-x-2 border-b-2 border-ink bg-nav',
        )}
      >
      <button
        type="button"
        onClick={() => {
          setYanking(true)
          toggle()
        }}
        onAnimationEnd={() => setYanking(false)}
        role="switch"
        aria-checked={dark}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={dark ? 'Light mode' : 'Dark mode'}
        className={cn(
          'pointer-events-auto flex origin-top flex-col items-center outline-none',
          // It hangs still until touched, then sways under the pointer and
          // swings when pulled. An idle animation would look livelier for a
          // second and then spend the rest of the session tugging at the
          // corner of the eye -- and a target that never stops moving is a
          // target that is harder to hit.
          yanking ? 'animate-yank' : 'hover:animate-sway focus-visible:animate-sway',
          'motion-reduce:animate-none',
          'focus-visible:ring-2 focus-visible:ring-blue',
        )}
      >
        {/* The cord. */}
        <span className="h-3.5 w-[2px] rounded-full bg-ink" aria-hidden="true" />
        {/* The bob: the thing you actually pull. */}
        <span
          className={cn(
            'grid h-6 w-6 place-items-center rounded-full bg-paper text-ink ring-2 ring-ink',
            'transition-[background-color,color,box-shadow] duration-200 ease-out-soft',
            'hover:bg-yellow hover:text-on-bright hover:shadow-[2px_2px_0_var(--color-ink)]',
          )}
        >
          <ThemeIcons dark={dark} size={13} />
        </span>
      </button>
      </span>
    </span>
  )
}

/** The plain square button, kept for surfaces with no wordmark to hang from. */
export function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'group grid h-10 w-10 place-items-center rounded-btn bg-paper text-ink ring-2 ring-ink',
        'transition-[transform,background-color,box-shadow] duration-200 ease-out-soft',
        'hover:bg-yellow hover:text-on-bright hover:shadow-[3px_3px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
        className,
      )}
    >
      <ThemeIcons dark={dark} />
    </button>
  )
}
