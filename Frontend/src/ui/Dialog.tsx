/**
 * Dialog — modal built on the native <dialog> element (showModal gives us the
 * backdrop, focus trap and Esc-to-close for free). `open` drives it from React.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Dialog({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-panel bg-paper p-0 text-ink shadow-[0_40px_80px_-30px_rgba(12,13,15,0.5)] backdrop:bg-[#0a2a52]/40 backdrop:backdrop-blur-sm open:animate-[dialog-in_0.45s_var(--ease-spring)]"
    >
      <button type="button" onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-fog transition-transform duration-300 hover:rotate-90" aria-label="Close">
        <Icon name="x" size={16} />
      </button>
      {open && children}
      <style>{`@keyframes dialog-in{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}`}</style>
    </dialog>
  )
}
