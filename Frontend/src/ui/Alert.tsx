/**
 * Alert — a short message block for form and page level feedback.
 * `role="alert"` so screen readers announce it the moment it appears.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'
import { Icon, type IconName } from './Icon'

export type AlertTone = 'danger' | 'success' | 'info'

const tones: Record<AlertTone, { box: string; icon: IconName }> = {
  danger: { box: 'bg-paper text-danger ring-1 ring-danger', icon: 'alert' },
  success: { box: 'bg-paper text-success ring-1 ring-success', icon: 'check' },
  info: { box: 'bg-blue-mist text-blue-ink ring-1 ring-blue', icon: 'terminal' },
}

export function Alert({ tone = 'danger', children, className }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  const t = tones[tone]
  return (
    <div role="alert" className={cn('flex items-start gap-2.5 rounded-btn px-3.5 py-3 font-mono text-[0.78rem] font-bold', t.box, className)}>
      <Icon name={t.icon} size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}
