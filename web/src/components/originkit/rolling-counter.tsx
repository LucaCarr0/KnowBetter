'use client'

import { useReducedMotion } from 'framer-motion'
import { Fragment, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import styles from './rolling-counter.module.css'

// Adapted from OriginKit Rolling Counter: https://www.originkit.dev/functional?c=rolling-counter
// Kept: odometer columns that count instead of jumping, the carry rippling up, hold to repeat
// faster and dragging the number. Controlled from outside and stepped; game colours, Italian
// thousands separator, no sound.
const PLACES = 6
/** The window a digit is seen through, px; matches the stylesheet. */
const CELL = 46
const DRAG_PX = 12
const STAGGER_MS = 45
const SPRING = { stiffness: .152, decay: .71 }
const SMEAR = .3
const SMEAR_MAX = 10

interface Column { position: number; velocity: number; target: number; due: number[]; next: number[] }

export function RollingCounter({ value, min, max, step = 1, onChange, disabled = false, label, lessLabel, moreLabel }: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
  label: string
  lessLabel: string
  moreLabel: string
}) {
  const reduced = useReducedMotion()
  const strips = useRef<(HTMLSpanElement | null)[]>([])
  const columns = useRef<Column[]>(Array.from({ length: PLACES }, (_, place) => {
    const count = Math.floor(value / 10 ** place)
    return { position: count, velocity: 0, target: count, due: [], next: [] }
  }))
  const frame = useRef(0)
  const live = useRef({ value, min, max, step, onChange, disabled })
  live.current = { value, min, max, step, onChange, disabled }

  const paint = () => columns.current.forEach((column, place) => {
    const strip = strips.current[place]
    if (!strip) return
    const digit = (column.position % 10 + 10) % 10
    const smear = Math.min(SMEAR_MAX, Math.abs(column.velocity) * CELL * SMEAR)
    strip.style.transform = `translateY(${(-digit * CELL).toFixed(2)}px)`
    strip.style.filter = smear > .15 ? `blur(${smear.toFixed(2)}px)` : ''
  })

  const run = () => {
    if (frame.current) return
    let previous = 0
    const tick = (time: number) => {
      const steps = previous ? Math.min(2.5, Math.max(0, (time - previous) / 16.67)) : 1
      previous = time
      const now = performance.now()
      let busy = false
      for (const column of columns.current) {
        while (column.due.length && column.due[0] <= now) {
          column.due.shift()
          column.target = column.next.shift()!
        }
        if (column.due.length) busy = true
        // A column far from home skips whole turns first; it looks the same.
        const gap = column.target - column.position
        if (Math.abs(gap) > 24) column.position += Math.round((gap - Math.sign(gap) * 24) / 10) * 10
        column.velocity += (column.target - column.position) * SPRING.stiffness * steps
        column.velocity *= SPRING.decay ** steps
        column.position += column.velocity * steps
        if (Math.abs(column.target - column.position) < .004 && Math.abs(column.velocity) < .004) {
          column.position = column.target
          column.velocity = 0
        } else busy = true
      }
      paint()
      frame.current = busy ? requestAnimationFrame(tick) : 0
    }
    frame.current = requestAnimationFrame(tick)
  }

  // Each column counts whole tens, hundreds… of the value: 9 → 10 moves one step, never back through eight digits.
  useEffect(() => {
    const now = performance.now()
    columns.current.forEach((column, place) => {
      const count = Math.floor(value / 10 ** place)
      if (reduced) Object.assign(column, { position: count, velocity: 0, target: count, due: [], next: [] })
      else {
        column.due.push(now + place * STAGGER_MS)
        column.next.push(count)
      }
    })
    if (reduced) paint()
    else run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced])

  const bump = (steps: number) => {
    const current = live.current
    if (current.disabled) return
    const next = Math.min(current.max, Math.max(current.min, current.value + steps * current.step))
    if (next === current.value) return
    current.value = next
    current.onChange(next)
  }

  // Holding a key: single steps, faster after a while, then tens after a second and a half.
  const hold = useRef({ timer: 0, since: 0 })
  const release = () => {
    clearTimeout(hold.current.timer)
    hold.current.timer = 0
  }
  const drag = useRef<{ y: number; rest: number; speed: number; at: number } | null>(null)
  const fling = useRef(0)
  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    // Reset, or a remount (Strict Mode) would think a roll is still running and never paint again.
    frame.current = 0
    cancelAnimationFrame(fling.current)
    release()
  }, [])

  const press = (event: ReactPointerEvent, direction: 1 | -1) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    release()
    bump(direction)
    hold.current.since = performance.now()
    const repeat = () => {
      const held = performance.now() - hold.current.since
      bump(direction * (held > 1_500 ? 10 : 1))
      hold.current.timer = window.setTimeout(repeat, held > 900 ? 55 : 90)
    }
    hold.current.timer = window.setTimeout(repeat, 380)
  }

  const stepsOf = (rest: number) => {
    const steps = Math.trunc(rest / DRAG_PX)
    if (steps) bump(steps)
    return rest - steps * DRAG_PX
  }
  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (live.current.disabled) return
    cancelAnimationFrame(fling.current)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { y: event.clientY, rest: 0, speed: 0, at: performance.now() }
  }
  const onMove = (event: ReactPointerEvent) => {
    const current = drag.current
    if (!current) return
    const now = performance.now()
    // Up is more.
    const moved = current.y - event.clientY
    current.y = event.clientY
    current.speed = current.speed * .6 + moved / Math.max(1, now - current.at) * .4
    current.at = now
    current.rest = stepsOf(current.rest + moved)
  }
  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!current || reduced) return
    // A hand that stopped before letting go threw nothing.
    let speed = performance.now() - current.at > 90 ? 0 : current.speed * 16.67
    if (Math.abs(speed) < 2) return
    let rest = current.rest
    const coast = () => {
      rest = stepsOf(rest + speed)
      speed *= .94
      if (Math.abs(speed) > .4) fling.current = requestAnimationFrame(coast)
    }
    fling.current = requestAnimationFrame(coast)
  }

  const shown = Math.max(1, String(value).length)
  const keyHandlers = (direction: 1 | -1) => ({
    onPointerDown: (event: ReactPointerEvent) => press(event, direction),
    onPointerUp: release, onPointerLeave: release, onPointerCancel: release,
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      bump(direction)
    },
  })

  return (
    <div className={`${styles.counter} ${disabled ? styles.counterOff : ''}`}>
      <button type="button" className={styles.key} aria-label={lessLabel} disabled={disabled || value <= min} {...keyHandlers(-1)}><Minus size={18} strokeWidth={3} aria-hidden="true" /></button>
      <div className={styles.number} role="spinbutton" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} aria-disabled={disabled}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onKeyDown={event => {
          const big = event.shiftKey ? 10 : 1
          if (event.key === 'ArrowUp') bump(big)
          else if (event.key === 'ArrowDown') bump(-big)
          else if (event.key === 'PageUp') bump(10)
          else if (event.key === 'PageDown') bump(-10)
          else return
          event.preventDefault()
        }}>
        {Array.from({ length: PLACES }, (_, index) => {
          const place = PLACES - 1 - index
          return (
            <Fragment key={place}>
              <span className={styles.column} data-on={place < shown || undefined} aria-hidden="true">
                <span className={styles.strip} ref={element => { strips.current[place] = element }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit, row) => <span key={row}>{digit}</span>)}
                </span>
              </span>
              {place === 3 && <span className={styles.separator} data-on={shown > 3 || undefined} aria-hidden="true">.</span>}
            </Fragment>
          )
        })}
      </div>
      <button type="button" className={styles.key} aria-label={moreLabel} disabled={disabled || value >= max} {...keyHandlers(1)}><Plus size={18} strokeWidth={3} aria-hidden="true" /></button>
    </div>
  )
}
