/**
 * Field — a labelled form input in the paper style: visible mono label, ink
 * ring that thickens on focus, optional leading icon, and an error message
 * wired to the input with aria-describedby.
 *
 * Deliberately square-shouldered (rounded-btn) rather than the pill used by
 * SearchField: forms read as a stack of blocks, search reads as a control.
 */
import { useId, useState, type InputHTMLAttributes } from 'react'
import { cn } from './cn'
import { Icon, type IconName } from './Icon'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  /** Message shown under the input; also flips the ring to the danger colour. */
  error?: string
  /** Small muted note under the input, shown only when there is no error. */
  hint?: string
  icon?: IconName
  /** Adds a show/hide toggle and starts masked. */
  reveal?: boolean
}

export function Field({ label, error, hint, icon, reveal, className, type = 'text', ...rest }: FieldProps) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="label-mono text-ink">
        {label}
      </label>

      <div className="relative">
        {icon && <Icon name={icon} size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />}

        <input
          id={id}
          type={reveal ? (shown ? 'text' : 'password') : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-12 w-full rounded-btn bg-paper font-mono text-[0.9rem] text-ink outline-none',
            'ring-1 transition-[box-shadow,background-color] duration-200 ease-out-soft',
            'placeholder:text-subtle focus:ring-2',
            error ? 'ring-danger focus:ring-danger' : 'ring-line hover:ring-subtle focus:ring-ink',
            icon ? 'pl-10' : 'pl-3.5',
            reveal ? 'pr-11' : 'pr-3.5',
          )}
          {...rest}
        />

        {reveal && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            // The input already announces itself; this control only needs its own name.
            aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-btn text-subtle transition-colors duration-200 hover:bg-fog hover:text-ink"
          >
            <Icon name={shown ? 'eyeOff' : 'eye'} size={16} />
          </button>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="font-mono text-[0.72rem] font-bold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="font-mono text-[0.72rem] text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
