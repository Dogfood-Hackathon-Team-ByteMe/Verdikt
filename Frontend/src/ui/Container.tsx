/**
 * Container — centres content and caps it at the site's max width, with the
 * standard side gutter. Wrap every section's content in one.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-6', className)}>{children}</div>
}
