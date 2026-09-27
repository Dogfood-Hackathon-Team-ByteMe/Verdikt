/**
 * useApi — tiny data-fetching hook.
 * Runs an async loader and tracks { data, error, loading }, re-running when
 * `deps` change. `reload()` refetches on demand, which the write-heavy screens
 * need after a create or submit.
 *
 * Deliberately minimal; swap for TanStack Query later without touching the
 * call sites.
 */
import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  /** Refetch with the current deps. */
  reload: () => void
}

export function useApi<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: Error | undefined; loading: boolean }>({
    data: undefined,
    error: undefined,
    loading: true,
  })
  // Bumping this re-runs the effect without changing the caller's deps.
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    load().then(
      (data) => alive && setState({ data, error: undefined, loading: false }),
      (error: Error) => alive && setState((s) => ({ data: s.data, error, loading: false })),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, reload }
}
