'use client'

import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

const formatter = new Intl.NumberFormat('it-IT')

export function CountUp({ from = 0, to, durationMs = 900, delayMs = 0, signed = false }: { from?: number; to: number; durationMs?: number; delayMs?: number; signed?: boolean }) {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? to : from)

  useEffect(() => {
    if (reduced) { setValue(to); return }
    const controls = animate(from, to, { duration: durationMs / 1000, delay: delayMs / 1000, ease: 'easeOut', onUpdate: latest => setValue(Math.round(latest)) })
    return () => controls.stop()
  }, [from, to, durationMs, delayMs, reduced])

  const text = formatter.format(value)
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{signed && value > 0 ? `+${text}` : text}</span>
}
