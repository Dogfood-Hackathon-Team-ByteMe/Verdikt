/**
 * ThemeToggle — switches between light and dark.
 *
 * The theme is an explicit `data-theme` attribute on <html>; with no attribute
 * the page follows the operating system (see the dark blocks in index.css).
 * The choice is saved in localStorage and re-applied before first paint by the
 * small script in index.html, so there's no flash of the wrong theme.
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

export function ThemeToggle({ className }: { className?: string }) {
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

  const dark = theme === 'dark'

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
      {/* Both icons live in one grid cell and cross-fade as the theme changes. */}
      <span className="relative grid h-[18px] w-[18px] place-items-center">
        <Icon
          name="sun"
          size={18}
          strokeWidth={2.1}
          className={cn('col-start-1 row-start-1 transition-all duration-300 ease-spring', dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')}
        />
        <Icon
          name="moon"
          size={17}
          strokeWidth={2.1}
          className={cn('col-start-1 row-start-1 transition-all duration-300 ease-spring', dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')}
        />
      </span>
    </button>
  )
}
