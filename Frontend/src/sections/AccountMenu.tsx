/**
 * AccountMenu — the nav's right-hand auth control.
 *
 * Signed out: a "Sign in" link and the yellow "Host an event" action, exactly
 * as before. Signed in: an initials avatar that opens a small paper popover
 * with the account and a sign-out button.
 */
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { globalBadgeFor, initialsFor } from '../auth/roles'
import { Link } from 'react-router-dom'
import { Button, Icon, cn } from '../ui'

export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, status, pending, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Close on an outside click or Escape — standard popover behaviour.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hold the layout steady while the first me() call resolves, so the nav
  // doesn't visibly reshuffle on load.
  if (status === 'loading') return <div className="h-10 w-10" aria-hidden="true" />

  if (!user) {
    return (
      <>
        <Link
          to="/login"
          onClick={onNavigate}
          className="hidden rounded-btn px-3 py-2 font-mono text-[0.78rem] font-bold hover:text-blue sm:inline-block"
        >
          Sign in
        </Link>
        <Button href="/signup" size="sm" icon="arrowRight" className="max-sm:hidden" onClick={onNavigate}>
          Create account
        </Button>
      </>
    )
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-yellow font-mono text-[0.72rem] font-bold text-on-bright ring-2 ring-ink transition-transform duration-200 hover:-translate-y-0.5"
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-full w-full object-cover object-center" />
        ) : (
          initialsFor(user)
        )}
      </button>

      <div
        role="menu"
        className={cn(
          'absolute right-0 top-12 w-60 origin-top-right rounded-card bg-paper p-4 ring-1 ring-ink transition-all duration-200 ease-out-soft',
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
        )}
      >
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover object-center ring-1 ring-ink"
            />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-yellow font-mono text-[0.68rem] font-bold text-on-bright ring-1 ring-ink">
              {initialsFor(user)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[0.82rem] font-bold text-ink">{user.name || user.email}</div>
        {/* The address, not a role: what someone *is* here depends on which
            event you are looking at, so a single global label would be a lie. */}
            <div className="truncate label-mono mt-0.5 text-muted">{user.email}</div>
          </div>
        </div>
        {globalBadgeFor(user) && (
          <div className="label-mono mt-2 inline-flex rounded-btn bg-red px-2 py-0.5 text-white">admin</div>
        )}

        <div className="mt-3 border-t border-line pt-3">
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-btn px-2 py-2 font-mono text-[0.8rem] font-bold text-ink transition-colors duration-200 hover:bg-fog hover:text-blue"
          >
            <Icon name="users" size={15} strokeWidth={2.2} />
            Profile
          </Link>
          <Link
            to="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-btn px-2 py-2 font-mono text-[0.8rem] font-bold text-ink transition-colors duration-200 hover:bg-fog hover:text-blue"
          >
            <Icon name="chart" size={15} strokeWidth={2.2} />
            Dashboard
          </Link>
          {/* Shown to everyone: hosting is an action any account can take, not
              a rank, so gating this on already organising something hid the
              only route to a first event. */}
          {(
            <Link
              to="/organizer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-btn px-2 py-2 font-mono text-[0.8rem] font-bold text-ink transition-colors duration-200 hover:bg-fog hover:text-blue"
            >
              <Icon name="scale" size={15} strokeWidth={2.2} />
              {user.organiser_in.length > 0 ? 'Your events' : 'Host an event'}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
            className="flex w-full items-center gap-2.5 rounded-btn px-2 py-2 font-mono text-[0.8rem] font-bold text-ink transition-colors duration-200 hover:bg-fog hover:text-danger disabled:opacity-50"
          >
            <Icon name="logOut" size={15} strokeWidth={2.2} />
            {pending ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
