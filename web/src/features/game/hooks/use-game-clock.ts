'use client'

import { useEffect, useRef, useState } from 'react'

/** Visual clock only. Acceptance, phase changes and scores remain on the server. */
export function useGameClock({ serverNow, deadline, opensAt, serverClockOffsetMs }: {
  serverNow: number
  deadline: number | null
  opensAt: number
  serverClockOffsetMs?: number
}) {
  const anchor = useRef({ serverNow, receivedAt: 0 })
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    anchor.current = { serverNow, receivedAt: performance.now() }
    const update = () => setNow(serverClockOffsetMs === undefined
      ? anchor.current.serverNow + performance.now() - anchor.current.receivedAt
      : Date.now() + serverClockOffsetMs)
    update()
    if (deadline === null) return
    const interval = window.setInterval(update, 100)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [serverNow, deadline, serverClockOffsetMs])

  const remainingMs = deadline === null ? 0 : Math.max(0, deadline - now)
  const durationMs = deadline === null ? 0 : Math.max(1, deadline - opensAt)
  return {
    now,
    seconds: Math.ceil(remainingMs / 1000),
    remainingMs,
    remainingPercent: durationMs ? Math.min(100, remainingMs / durationMs * 100) : 0,
    isOpen: now >= opensAt && (deadline === null || now < deadline),
  }
}
