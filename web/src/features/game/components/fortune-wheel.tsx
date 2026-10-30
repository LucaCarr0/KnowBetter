'use client'

import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { SLICE_DEGREES, WHEEL_SLICES, sliceAtAngle, spinAngle, type SpinTrajectory, type WheelSliceKind } from '../wheel'
import { TEXTS } from '../../../texts'
import styles from '../styles/wheel.module.css'

const SIZE = 340
const RADIUS = 160
export const SLICE_COLORS: Record<WheelSliceKind, string> = {
  minigame: '#ff7657', flash_all: '#4cc9f0', flash_self: '#7c6cf0', plus: '#b8e36d', minus: '#3a3f66', double: '#ffd166', half: '#e0264f',
}
const LABEL_COLORS: Partial<Record<WheelSliceKind, string>> = { minus: '#f8f1e6', half: '#fff', flash_self: '#fff' }

/** Below this the wheel refuses to go, like a real one pushed too gently. */
const MIN_SPEED = .3
const MAX_SPEED = 1.8
const RELEASE_WINDOW_MS = 90
const HANDOFF_MS = 450
const FREE_SPIN_GRACE_MS = 3_000
const FLAP_KICK = 26

const toRadians = (degrees: number) => (degrees - 90) * Math.PI / 180
const pointAt = (radius: number, degrees: number) => `${(radius * Math.cos(toRadians(degrees))).toFixed(2)} ${(radius * Math.sin(toRadians(degrees))).toFixed(2)}`
const nearestDelta = (degrees: number) => ((degrees % 360) + 540) % 360 - 180

// The rotation survives scene remounts between turns, so the wheel never snaps back.
let restAngle = 0

const WheelFace = memo(function WheelFace() {
  return (
    <svg viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`} className={styles.wheelSvg} aria-hidden="true">
      <circle r={RADIUS + 8} fill="#10142f" />
      {WHEEL_SLICES.map((slice, index) => {
        const from = index * SLICE_DEGREES
        const center = from + SLICE_DEGREES / 2
        return (
          <g key={index}>
            <path d={`M0 0 L${pointAt(RADIUS, from)} A${RADIUS} ${RADIUS} 0 0 1 ${pointAt(RADIUS, from + SLICE_DEGREES)} Z`} fill={SLICE_COLORS[slice]} stroke="#10142f" strokeWidth=".8" />
            <text transform={`rotate(${center}) translate(0 ${-RADIUS + 19})`} textAnchor="middle" fontSize={slice === 'plus' || slice === 'minus' ? 15 : 11} fontWeight="900" fill={LABEL_COLORS[slice] ?? '#10142f'}>{TEXTS.wheel.sliceWheelLabels[slice]}</text>
            <circle cx={(RADIUS + 3.5) * Math.cos(toRadians(from))} cy={(RADIUS + 3.5) * Math.sin(toRadians(from))} r="2.6" fill="#ffd166" />
          </g>
        )
      })}
      <circle r="50" fill="#10142f" />
      <clipPath id="wheel-hub"><circle r="44" /></clipPath>
      <image href="/hosts/jerry/jerry.webp" x="-44" y="-50" width="88" height="94" clipPath="url(#wheel-hub)" preserveAspectRatio="xMidYMid slice" />
    </svg>
  )
})

export function FortuneWheel({ trajectory, canSpin, onSpin, clockOffsetMs, idle = false, onLanded }: {
  trajectory: SpinTrajectory | null
  canSpin: boolean
  /** From -1 to 1: the sign is the direction of the swipe. */
  onSpin: (strength: number) => void
  clockOffsetMs: number
  idle?: boolean
  onLanded?: () => void
}) {
  const disc = useRef<HTMLDivElement>(null)
  const flapper = useRef<HTMLDivElement>(null)
  const angle = useRef(restAngle)
  const live = useRef({ trajectory, canSpin, clockOffsetMs, idle, onLanded, onSpin })
  live.current = { trajectory, canSpin, clockOffsetMs, idle, onLanded, onSpin }
  const gesture = useRef<{ pointerId: number; last: number; samples: { at: number; angle: number }[]; startAngle: number } | null>(null)
  const motionState = useRef<{ mode: 'rest' | 'free' | 'return' | 'follow'; velocity: number; since: number; handoff: number | null; handoffDelta: number; landed: boolean; target: number }>({ mode: 'rest', velocity: 0, since: 0, handoff: null, handoffDelta: 0, landed: false, target: restAngle })
  const [tooSlow, setTooSlow] = useState(false)

  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    let flap = 0
    let lastSlice = sliceAtAngle(angle.current)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = (now: number) => {
      const delta = Math.min(50, now - previous)
      previous = now
      const state = motionState.current
      const { trajectory: path, clockOffsetMs: offset, idle: idling } = live.current

      if (path) {
        if (state.mode !== 'follow') {
          // Join the shared path from wherever this phone is, without a visible jump.
          const serverNow = Date.now() + offset
          const lateJoin = serverNow - path.startedAt > 900
          state.mode = 'follow'
          state.landed = false
          state.handoff = now
          state.handoffDelta = lateJoin || reduced ? 0 : nearestDelta(angle.current - spinAngle(path, serverNow))
        }
        const serverNow = Date.now() + offset
        const blend = state.handoff === null ? 0 : Math.max(0, 1 - (now - state.handoff) / HANDOFF_MS)
        const finished = serverNow >= path.startedAt + path.durationMs
        angle.current = reduced ? path.finalAngle : spinAngle(path, serverNow) + state.handoffDelta * blend * blend
        if (finished && !state.landed) {
          state.landed = true
          angle.current = path.finalAngle
          restAngle = path.finalAngle
          live.current.onLanded?.()
        }
      } else if (state.mode === 'follow') {
        state.mode = 'rest'
      } else if (state.mode === 'free') {
        // Immediate response under the finger while the coordinator answers.
        state.velocity *= Math.exp(-delta / 2_500)
        angle.current += state.velocity * delta
        if (now - state.since > FREE_SPIN_GRACE_MS) {
          state.mode = 'return'
          state.target = angle.current
        }
      } else if (state.mode === 'return') {
        const gap = state.target - angle.current
        state.velocity = (state.velocity + gap * .0009 * delta) * Math.exp(-delta / 90)
        angle.current += state.velocity * delta
        if (Math.abs(gap) < .1 && Math.abs(state.velocity) < .005) {
          angle.current = state.target
          state.mode = 'rest'
        }
      } else if (idling && !reduced && !gesture.current) {
        angle.current += delta * .012
      }

      const slice = sliceAtAngle(angle.current)
      if (slice !== lastSlice) {
        lastSlice = slice
        flap = FLAP_KICK
        if (state.mode === 'follow' && !state.landed) navigator.vibrate?.(3)
      }
      flap *= Math.exp(-delta / 55)
      if (disc.current) disc.current.style.transform = `rotate(${angle.current}deg)`
      if (flapper.current) flapper.current.style.transform = `translateX(-50%) rotate(${flap}deg)`
      if (!state.landed && state.mode !== 'follow') restAngle = angle.current
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  function pointerAngle(event: ReactPointerEvent) {
    const box = disc.current!.parentElement!.getBoundingClientRect()
    return Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2)) * 180 / Math.PI
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canSpin || trajectory || motionState.current.mode === 'free') return
    event.currentTarget.setPointerCapture(event.pointerId)
    setTooSlow(false)
    motionState.current.mode = 'rest'
    gesture.current = { pointerId: event.pointerId, last: pointerAngle(event), samples: [{ at: performance.now(), angle: angle.current }], startAngle: angle.current }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = gesture.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const current = pointerAngle(event)
    angle.current += nearestDelta(current - drag.last)
    drag.last = current
    const at = performance.now()
    drag.samples.push({ at, angle: angle.current })
    while (drag.samples.length > 2 && at - drag.samples[0].at > RELEASE_WINDOW_MS) drag.samples.shift()
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = gesture.current
    if (!drag || drag.pointerId !== event.pointerId) return
    gesture.current = null
    const first = drag.samples[0]
    const lastSample = drag.samples.at(-1)!
    const elapsed = performance.now() - first.at
    const speed = elapsed > 0 ? (lastSample.angle - first.angle) / elapsed : 0
    const state = motionState.current
    if (Math.abs(speed) < MIN_SPEED) {
      state.mode = 'return'
      state.velocity = 0
      state.target = drag.startAngle
      setTooSlow(Math.abs(angle.current - drag.startAngle) > 2)
      return
    }
    const power = Math.max(.02, Math.min(1, (Math.abs(speed) - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)))
    state.mode = 'free'
    state.velocity = speed
    state.since = performance.now()
    live.current.onSpin(Math.sign(speed) * power)
  }

  function onPointerCancel() {
    const drag = gesture.current
    if (!drag) return
    gesture.current = null
    motionState.current.mode = 'return'
    motionState.current.velocity = 0
    motionState.current.target = drag.startAngle
  }

  function spinWithoutSwipe() {
    const state = motionState.current
    if (!canSpin || trajectory || state.mode === 'free') return
    state.mode = 'free'
    state.velocity = .9
    state.since = performance.now()
    live.current.onSpin(.6)
  }

  return (
    <div className={styles.wheelBlock}>
      <div className={`${styles.wheelFrame} ${canSpin && !trajectory ? styles.wheelReady : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        <div ref={flapper} className={styles.flapper} aria-hidden="true" />
        <div ref={disc} className={styles.wheelDisc}><WheelFace /></div>
      </div>
      {canSpin && !trajectory && <button type="button" className={`sr-only focus:not-sr-only daisy-btn daisy-btn-sm ${styles.swipeFallback}`} onClick={spinWithoutSwipe}>{TEXTS.wheel.spinLabel}</button>}
      {tooSlow && !trajectory && <p role="status" className={styles.tooSlow}>{TEXTS.wheel.hintTooSlow}</p>}
    </div>
  )
}
