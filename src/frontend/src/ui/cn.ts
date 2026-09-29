/**
 * cn — joins class names, dropping any that are false/null/undefined.
 * Lets components write `cn('base', active && 'is-active')`.
 */
export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')
