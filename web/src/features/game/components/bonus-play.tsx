'use client'

import { useEffect, useRef } from 'react'
import type { BonusSnapshot } from '../types'
import styles from '../styles/game-stage.module.css'

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
  const feedback = bonus.lastOutcome === 'reset' ? 'Era la risposta vera! Catena azzerata: riparti dalla prima.'
    : bonus.lastOutcome === 'timeout' ? 'Cinque secondi passati! Catena azzerata: riparti dalla prima.'
      : bonus.lastOutcome === 'advanced' ? 'Falsa al punto giusto. Continua così!' : 'Trova la risposta falsa. Un tocco e vai.'
  return <div className={styles.selectionForm}>
    <p className={styles.instructions}><strong>Scegli la risposta falsa.</strong> Ogni tocco invia subito la scelta.</p>
    <p className={styles.correctAnswer} aria-label={`Catena ${bonus.chain} di ${bonus.target}`}>{bonus.chain} / {bonus.target}</p>
    <progress className={`daisy-progress ${styles.timerProgress}`} value={bonus.chain} max={bonus.target} aria-label="Progresso della catena" />
    <p role="status" className={styles.smallCopy}>{bonus.completedMs !== null ? `Catena completata in ${(bonus.completedMs / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} secondi. Aspettiamo gli altri!` : feedback}</p>
    {bonus.question && <>
      <div className={styles.timerBlock}>
        <div className={styles.timerLabel}><span>Tempo della domanda</span><span role="timer" aria-live="off" className={styles.timerNumber}>{Math.ceil(remaining / 1000)}<small>s</small></span></div>
        <progress className={`daisy-progress ${styles.timerProgress}`} value={Math.min(100, remaining / bonus.questionMs * 100)} max={100} aria-label="Tempo della domanda" />
      </div>
      <div className={styles.questionBox}><span className={styles.eyebrow}>Domanda {bonus.chain + 1} di {bonus.target}</span><h2 ref={prompt} tabIndex={-1} className={styles.questionText}>{bonus.question.prompt}</h2></div>
      <div className={styles.answerChoices} role="group" aria-label="Scegli la risposta falsa">
        {bonus.question.options.map((option, index) => <button type="button" key={`${bonus.question!.instanceId}:${option.id}`} disabled={disabled || pending || remaining <= 0} className={`daisy-btn ${styles.choice}`} onClick={() => onAnswer(option.id, bonus.question!.instanceId)}><span className={styles.optionLetter}>{String.fromCharCode(65 + index)}</span><span className={styles.optionText}>{option.text}</span></button>)}
      </div>
      {pending && <p role="status" className={styles.smallCopy}>Invio in corso…</p>}
      {remaining <= 0 && <p className={styles.smallCopy}>Tempo della domanda scaduto. Riceviamo la nuova domanda…</p>}
    </>}
    <p className={styles.participantCount}>{bonus.completedCount} / {bonus.participantCount} concorrenti hanno completato.</p>
  </div>
}
