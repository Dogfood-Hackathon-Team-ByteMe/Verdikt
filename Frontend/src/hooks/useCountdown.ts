/**
 * useCountdown — ticks every second toward an ISO-8601 target time and returns
 * the remaining days/hours/minutes/seconds plus a `closed` flag.
 * `pad` zero-pads a number to two digits for display (e.g. 6 -> "06").
 */
import { useEffect, useState } from 'react'

export function useCountdown(targetIso: string | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const target = targetIso ? Date.parse(targetIso) : NaN
  const ms = Number.isNaN(target) ? 0 : Math.max(0, target - now)
  const s = Math.floor(ms / 1000)
  return {
    closed: !Number.isNaN(target) && ms === 0,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

export const pad = (n: number) => String(n).padStart(2, '0')
