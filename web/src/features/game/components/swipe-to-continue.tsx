'use client'

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import styles from '../styles/swipe-to-continue.module.css'
import { TEXTS } from '../../../texts'

interface SwipeToContinueProps {
  label: string
  disabled?: boolean
  pending?: boolean
  onContinue: () => void | Promise<void>
}

interface Drag {
  pointerId: number
  startX: number
  distance: number
  travel: number
}

const completionRatio = 0.9
const minimumTravel = 24

export function SwipeToContinue({ label, disabled = false, pending = false, onContinue }: SwipeToContinueProps) {
  const instructionsId = useId()
  const rail = useRef<HTMLDivElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const drag = useRef<Drag | null>(null)
  const inFlight = useRef(false)
  const [distance, setDistance] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const busy = pending || submitting
  const blocked = disabled || busy

  function releaseDrag() {
    const pointerId = drag.current?.pointerId
    drag.current = null
    if (pointerId !== undefined && handle.current?.hasPointerCapture(pointerId)) {
      handle.current.releasePointerCapture(pointerId)
    }
    setDragging(false)
  }

  function cancelDrag() {
    releaseDrag()
    setDistance(0)
  }

  useEffect(() => {
    if (disabled || pending) cancelDrag()
  }, [disabled, pending])

  async function continueGame() {
    // The ref closes the gap before React renders the disabled button.
    if (disabled || pending || inFlight.current) return
    inFlight.current = true
    releaseDrag()
    setSubmitting(true)
    setError('')
    try {
      await onContinue()
    } catch {
      setError(TEXTS.swipe.failed)
    } finally {
      inFlight.current = false
      setSubmitting(false)
      setDistance(0)
    }
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (blocked || inFlight.current || drag.current || !event.isPrimary || event.button !== 0) return
    const travel = (rail.current?.clientWidth ?? 0) - event.currentTarget.offsetWidth
    if (travel < minimumTravel) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX, distance: 0, travel }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    setError('')
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    current.distance = Math.min(current.travel, Math.max(0, event.clientX - current.startX))
    setDistance(current.distance)
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const finalDistance = Math.min(current.travel, Math.max(0, event.clientX - current.startX))
    const completed = finalDistance >= current.travel * completionRatio && finalDistance >= minimumTravel
    releaseDrag()
    if (completed) {
      setDistance(current.travel)
      void continueGame()
    } else setDistance(0)
  }

  function cancelPointer(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId === event.pointerId) cancelDrag()
  }

  return (
    <div className={`${styles.swipe} ${dragging ? styles.dragging : ''} ${blocked ? styles.blocked : ''}`}>
      <div className={styles.track}>
        <div ref={rail} className={styles.rail}>
          <span className={styles.fill} style={{ width: `calc(3.25rem + ${distance}px)` }} aria-hidden="true" />
          <span className={styles.label} aria-hidden="true">{busy ? TEXTS.game.sending : label}</span>
          <button
            ref={handle}
            type="button"
            className={`daisy-btn ${styles.handle}`}
            style={{ transform: `translateX(${distance}px)` }}
            disabled={blocked}
            aria-label={label}
            aria-describedby={instructionsId}
            aria-busy={busy}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelPointer}
            onLostPointerCapture={cancelPointer}
            onBlur={cancelDrag}
            onKeyDown={(event) => {
              if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
            }}
            onClick={(event) => {
              // Keyboard and assistive activation emit clicks without a pointer click count.
              // A tap or click on the handle must still complete the drag gesture.
              if (event.detail === 0) void continueGame()
            }}
          >
            <ArrowRight size={25} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p id={instructionsId} className={styles.instructions}>{TEXTS.swipe.instructions}<span className="sr-only">{TEXTS.swipe.screenReader}</span></p>
      <p className={`${styles.status} ${error ? styles.error : ''}`} role="status" aria-live="polite">{error || (busy ? TEXTS.game.sending : '')}</p>
    </div>
  )
}
