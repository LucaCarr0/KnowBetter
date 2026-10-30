'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion'
import { ChevronsUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import styles from '../styles/wheel.module.css'

const DISTANCE = 90
const VELOCITY = 500

// The flick and the tilt draw on OriginKit Swipe Stack: https://www.originkit.dev/components/swipe-stack
export function SwipeUpCard({ children, hint, buttonLabel, disabled = false, onConfirm }: {
  children: ReactNode
  hint: string
  buttonLabel: string
  disabled?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const reduced = useReducedMotion()
  const y = useMotionValue(0)
  const rotate = useTransform(y, [-200, 0], [-5, 0])
  const scale = useTransform(y, [-200, 0], [1.04, 1])
  const [sent, setSent] = useState(false)

  async function confirm() {
    if (disabled || sent) return
    setSent(true)
    if (!reduced) await animate(y, -260, { duration: .22, ease: 'easeIn' })
    await onConfirm()
    // Stays usable if the command was refused: the scene changes otherwise.
    setSent(false)
    animate(y, 0, { type: 'spring', stiffness: 300, damping: 22 })
  }

  function onDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.y < -DISTANCE || info.velocity.y < -VELOCITY) void confirm()
    else animate(y, 0, { type: 'spring', stiffness: 420, damping: 20 })
  }

  return (
    <div className={styles.swipeArea}>
      <motion.div className={`${styles.swipeCard} ${disabled ? styles.swipeCardDisabled : ''}`} style={{ y, rotate, scale }}
        drag={disabled || sent ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: .75, bottom: .12 }} dragMomentum={false} onDragEnd={onDragEnd}>
        {children}
      </motion.div>
      <p className={styles.swipeHint} aria-hidden="true"><ChevronsUp size={18} className={styles.swipeArrow} />{hint}</p>
      <button type="button" className={`daisy-btn daisy-btn-ghost daisy-btn-sm ${styles.swipeFallback}`} disabled={disabled || sent} onClick={() => void confirm()}>{buttonLabel}</button>
    </div>
  )
}
