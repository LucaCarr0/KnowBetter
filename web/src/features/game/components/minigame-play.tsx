'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { PlayerAvatar } from '../../rooms/components/player-avatar'
import type { GamePlayer } from '../types'
import type { MinigameView } from '../wheel'
import { TEXTS } from '../../../texts'
import styles from '../styles/wheel.module.css'

const M = TEXTS.wheel.minigames
const numberFormatter = new Intl.NumberFormat('it-IT')
const seconds = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',')

export interface MinigamePlayProps {
  view: MinigameView
  players: GamePlayer[]
  selfId: string
  participantCount: number
  disabled: boolean
  pending: boolean
  onAction: (action: Record<string, unknown>) => void | Promise<void>
}

function TimerPlay({ view, participantCount, disabled, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'timer' }> }) {
  // shortcut: a reload restarts the local count, anchor it to the server if that gets abused.
  const [startedAt] = useState(() => performance.now())
  const [elapsed, setElapsed] = useState(0)
  const [stoppedAt, setStoppedAt] = useState<number | null>(null)

  useEffect(() => {
    if (stoppedAt !== null) return
    let frame = 0
    const tick = () => { setElapsed(performance.now() - startedAt); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [startedAt, stoppedAt])

  const stopped = view.selfElapsedMs ?? stoppedAt
  const hidden = stopped === null && elapsed >= view.hideAfterMs
  const shown = stopped ?? elapsed

  return (
    <div className={styles.playArea}>
      <p className={styles.playHeadline}>{M.timer.target(seconds(view.targetMs))}</p>
      <div className={`${styles.bigClock} ${hidden ? styles.bigClockHidden : ''}`} aria-hidden={hidden}>{hidden ? '??,??' : seconds(shown)}</div>
      {stopped !== null ? <p role="status" className={styles.playStatus}>{M.timer.yours(seconds(stopped))} {M.timer.waiting(view.stoppedCount, participantCount)}</p>
        : <button type="button" disabled={disabled} className={`daisy-btn ${styles.bigAction} ${styles.bigActionStop}`} onClick={() => {
          const value = performance.now() - startedAt
          setStoppedAt(value)
          void onAction({ type: 'stop', elapsedMs: value })
        }}>{M.timer.stop}</button>}
    </div>
  )
}

function NumbersPlay({ view, participantCount, disabled, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'numbers' }> }) {
  const [next, setNext] = useState(1)
  const [frozen, setFrozen] = useState(false)
  const [wrong, setWrong] = useState<number | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timeout.current), [])
  const done = view.selfFinishedMs !== null || next > view.grid.length

  function tap(value: number) {
    if (frozen || disabled || done) return
    if (value !== next) {
      setFrozen(true)
      setWrong(value)
      navigator.vibrate?.(60)
      timeout.current = setTimeout(() => { setFrozen(false); setWrong(null) }, 1_000)
      return
    }
    setNext(next + 1)
    if (next === view.grid.length) void onAction({ type: 'finish' })
  }

  return (
    <div className={styles.playArea}>
      <p role="status" className={styles.playHeadline}>{done ? M.numbers.finished : M.numbers.next(next)}</p>
      <div className={`${styles.numberGrid} ${frozen ? styles.numberGridFrozen : ''}`}>
        {view.grid.map(value => {
          const cleared = value < next || done
          return <motion.button type="button" key={value} disabled={disabled || cleared} aria-label={String(value)}
            className={`${styles.numberTile} ${wrong === value ? styles.numberTileWrong : ''}`}
            animate={cleared ? { scale: .6, opacity: .15, rotate: 12 } : { scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }} onPointerDown={() => tap(value)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tap(value) } }}>{value}</motion.button>
        })}
      </div>
      <p className={styles.playStatus}>{M.numbers.waiting(view.finishedCount, participantCount)}</p>
    </div>
  )
}

function BalloonPlay({ view, disabled, pending, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'balloon' }> }) {
  const [localPumps, setLocalPumps] = useState(view.pumps)
  const [cashing, setCashing] = useState(false)
  const unsent = useRef(0)
  const live = useRef({ pending, disabled, onAction, cashing, status: view.status })
  live.current = { pending, disabled, onAction, cashing, status: view.status }

  // Taps are grouped: every command is a database transaction on the coordinator.
  useEffect(() => {
    const flush = setInterval(() => {
      const { pending: busy, onAction: send, cashing: wantsCash, status } = live.current
      if (busy || status !== 'pumping') return
      if (unsent.current > 0) {
        const count = Math.min(20, unsent.current)
        unsent.current -= count
        void send({ type: 'pump', count })
      } else if (wantsCash) {
        setCashing(false)
        void send({ type: 'cash' })
      }
    }, 250)
    return () => clearInterval(flush)
  }, [])

  const pumps = Math.max(localPumps, view.pumps)
  const pumping = view.status === 'pumping' && !cashing
  const scale = Math.min(2.6, .8 + pumps * .06)

  return (
    <div className={styles.playArea}>
      <button type="button" className={styles.balloonStage} disabled={disabled || !pumping} aria-label={M.balloon.pump} onPointerDown={event => {
        event.preventDefault()
        if (disabled || !pumping) return
        unsent.current++
        setLocalPumps(pumps + 1)
      }} onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ') && pumping && !disabled) { event.preventDefault(); unsent.current++; setLocalPumps(pumps + 1) }
      }}>
        <AnimatePresence mode="wait">
          {view.status === 'popped'
            ? <motion.span key="pop" className={styles.balloonFace} initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }} transition={{ duration: .2 }}>💥</motion.span>
            : <motion.span key="balloon" className={styles.balloonFace} animate={{ scale, rotate: pumps % 2 ? 2 : -2 }} exit={{ scale: scale + .6, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>🎈</motion.span>}
        </AnimatePresence>
      </button>
      <div role="status" className={styles.playHeadline}>
        {view.status === 'popped' ? M.balloon.popped : view.status === 'cashed' ? M.balloon.cashed(view.pumps) : M.balloon.tap}
      </div>
      {view.status === 'pumping' && <button type="button" disabled={disabled || pumps === 0 || cashing} className={`daisy-btn ${styles.bigAction}`} onClick={() => setCashing(true)}>{M.balloon.cash(pumps)}</button>}
      <p className={styles.playStatus}>{M.balloon.waiting(view.cashedCount, view.poppedCount)}</p>
    </div>
  )
}

function ChestsPlay({ view, participantCount, disabled, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'chests' }> }) {
  const [picked, setPicked] = useState<number | null>(null)
  const chosen = view.selfPick ?? picked
  return (
    <div className={styles.playArea}>
      <div className={styles.chestRow}>
        {view.chests.map((value, index) => <motion.button type="button" key={index} disabled={disabled || chosen !== null} aria-label={M.chests.chest(numberFormatter.format(value))} aria-pressed={chosen === index}
          className={`${styles.chest} ${chosen === index ? styles.chestChosen : ''}`} whileTap={{ scale: .9 }} animate={chosen === index ? { y: -12, rotate: [0, -6, 6, 0] } : chosen !== null ? { opacity: .35, scale: .92 } : { y: [0, -5, 0] }}
          transition={chosen === null ? { duration: 1.4, repeat: Infinity, delay: index * .25 } : { duration: .4 }}
          onClick={() => { setPicked(index); void onAction({ type: 'pick', value: index }) }}>
          <span className={styles.chestIcon}>{chosen === index ? '💰' : '🧰'}</span><strong>{numberFormatter.format(value)}</strong>
        </motion.button>)}
      </div>
      <p role="status" className={styles.playStatus}>{chosen !== null ? `${M.chests.chosen} ` : ''}{M.chests.waiting(view.pickedCount, participantCount)}</p>
    </div>
  )
}

function HighestPlay({ view, participantCount, disabled, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'highest' }> }) {
  const [picked, setPicked] = useState<number | null>(null)
  const chosen = view.selfPick ?? picked
  return (
    <div className={styles.playArea}>
      <div className={styles.pickGrid}>
        {Array.from({ length: view.max }, (_, index) => index + 1).map(value => <motion.button type="button" key={value} disabled={disabled || chosen !== null} aria-pressed={chosen === value}
          className={`${styles.pickTile} ${chosen === value ? styles.pickTileChosen : ''}`} whileTap={{ scale: .85 }} animate={chosen === value ? { scale: 1.2 } : chosen !== null ? { opacity: .3 } : {}}
          onClick={() => { setPicked(value); void onAction({ type: 'pick', value }) }}>{value}</motion.button>)}
      </div>
      <p role="status" className={styles.playStatus}>{chosen !== null ? `${M.highest.chosen(chosen)} ` : ''}{M.highest.waiting(view.pickedCount, participantCount)}</p>
    </div>
  )
}

function BombPlay({ view, players, selfId, disabled, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'bomb' }> }) {
  const mine = view.holderId === selfId
  const holder = players.find(player => player.id === view.holderId)
  const blasted = players.find(player => player.id === view.lastBlastId)
  const [flash, setFlash] = useState(false)
  const seenBlasts = useRef(view.blastsDone)
  useEffect(() => {
    if (view.blastsDone === seenBlasts.current) return
    seenBlasts.current = view.blastsDone
    setFlash(true)
    if (view.lastBlastId === selfId) navigator.vibrate?.(200)
    const timeout = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(timeout)
  }, [view.blastsDone, view.lastBlastId, selfId])
  const rivals = players.filter(player => !player.retired)

  return (
    <div className={`${styles.playArea} ${mine ? styles.bombDanger : ''}`}>
      <p role="status" className={styles.playHeadline}>{flash && blasted ? M.bomb.blast(blasted.nickname) : mine ? M.bomb.yours : M.bomb.holder(holder?.nickname ?? '')}</p>
      <AnimatePresence>{flash && <motion.div className={styles.blastFlash} initial={{ opacity: .9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: .8 }} aria-hidden="true" />}</AnimatePresence>
      <div className={styles.bombCircle}>
        {rivals.map(player => {
          const blocked = player.id === view.blockedId && rivals.filter(entry => entry.connected && entry.id !== selfId).length > 1
          const canPass = mine && !disabled && player.id !== selfId && player.connected && !blocked
          return <button type="button" key={player.id} disabled={!canPass} aria-label={M.bomb.passTo(player.nickname)} className={`${styles.bombSeat} ${canPass ? styles.bombSeatTarget : ''} ${blocked ? styles.bombSeatBlocked : ''}`} onClick={() => void onAction({ type: 'pass', targetId: player.id })}>
            <PlayerAvatar avatarId={player.avatarId} className="size-12" />
            <span className={styles.bombName}>{player.id === selfId ? TEXTS.leaderboard.you : player.nickname}</span>
            {player.id === view.holderId && <motion.span layoutId="bomb" className={styles.bombToken} transition={{ type: 'spring', stiffness: 380, damping: 24 }} aria-hidden="true">💣</motion.span>}
          </button>
        })}
      </div>
      <p className={styles.playStatus}>{M.bomb.blasts(view.blastsDone, view.totalBlasts)}</p>
    </div>
  )
}

export function MinigamePlay(props: MinigamePlayProps) {
  const { view } = props
  switch (view.kind) {
    case 'timer': return <TimerPlay {...props} view={view} />
    case 'numbers': return <NumbersPlay {...props} view={view} />
    case 'balloon': return <BalloonPlay {...props} view={view} />
    case 'chests': return <ChestsPlay {...props} view={view} />
    case 'highest': return <HighestPlay {...props} view={view} />
    case 'bomb': return <BombPlay {...props} view={view} />
  }
}
