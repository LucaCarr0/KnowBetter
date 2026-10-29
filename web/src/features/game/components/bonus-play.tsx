'use client'

import { useEffect, useRef } from 'react'
import type { BonusSnapshot } from '../types'
import styles from '../styles/game-stage.module.css'
import { TEXTS } from '../../../texts'

export function BonusPlay({ bonus, now, disabled, pending, onAnswer }: {
  bonus: BonusSnapshot
  now: number
  disabled: boolean
  pending: boolean
  onAnswer: (optionId: string, questionInstanceId: string) => void
}) {
  const prompt = useRef<HTMLHeadingElement>(null)
  useEffect(() => { prompt.current?.focus({ preventScroll: true }) }, [bonus.question?.instanceId])
  const remaining = bonus.questionDeadline === null ? 0 : Math.max(0, bonus.questionDeadline - now)
  const feedback = bonus.lastOutcome === 'reset' ? TEXTS.bonus.feedbackReset
    : bonus.lastOutcome === 'timeout' ? TEXTS.bonus.feedbackTimeout
      : bonus.lastOutcome === 'advanced' ? TEXTS.bonus.feedbackAdvanced : TEXTS.bonus.feedbackStart
  return <div className={styles.selectionForm}>
    <p className={styles.instructions}><strong>{TEXTS.bonus.instructionsStrong}</strong> {TEXTS.bonus.instructions}</p>
    <p className={styles.correctAnswer} aria-label={TEXTS.bonus.chainLabel(bonus.chain, bonus.target)}>{bonus.chain} / {bonus.target}</p>
    <progress className={`daisy-progress ${styles.timerProgress}`} value={bonus.chain} max={bonus.target} aria-label={TEXTS.bonus.chainProgress} />
    <p role="status" className={styles.smallCopy}>{bonus.completedMs !== null ? TEXTS.bonus.completed((bonus.completedMs / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })) : feedback}</p>
    {bonus.question && <>
      <div className={styles.timerBlock}>
        <div className={styles.timerLabel}><span>{TEXTS.bonus.questionTime}</span><span role="timer" aria-live="off" className={styles.timerNumber}>{Math.ceil(remaining / 1000)}<small>s</small></span></div>
        <progress className={`daisy-progress ${styles.timerProgress}`} value={Math.min(100, remaining / bonus.questionMs * 100)} max={100} aria-label={TEXTS.bonus.questionTime} />
      </div>
      <div className={styles.questionBox}><span className={styles.eyebrow}>{TEXTS.bonus.questionNumber(bonus.chain + 1, bonus.target)}</span><h2 ref={prompt} tabIndex={-1} className={styles.questionText}>{bonus.question.prompt}</h2></div>
      <div className={styles.answerChoices} role="group" aria-label={TEXTS.bonus.choicesLabel}>
        {bonus.question.options.map((option, index) => <button type="button" key={`${bonus.question!.instanceId}:${option.id}`} disabled={disabled || pending || remaining <= 0} className={`daisy-btn ${styles.choice}`} onClick={() => onAnswer(option.id, bonus.question!.instanceId)}><span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span><span className={styles.optionText}>{option.text}</span></button>)}
      </div>
      {pending && <p role="status" className={styles.smallCopy}>{TEXTS.game.sending}</p>}
      {remaining <= 0 && <p className={styles.smallCopy}>{TEXTS.bonus.questionExpired}</p>}
    </>}
    <p className={styles.participantCount}>{TEXTS.bonus.completedCount(bonus.completedCount, bonus.participantCount)}</p>
  </div>
}
