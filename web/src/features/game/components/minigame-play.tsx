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
  /** Server time, ticking while the game is open. */
  now: number
  startedAt: number
  clockOffsetMs: number
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

/** Taps are grouped: every command is a database transaction on the coordinator. */
function useTapBatches(type: string, active: boolean, pending: boolean, onAction: MinigamePlayProps['onAction']) {
  const unsent = useRef(0)
  const live = useRef({ pending, onAction, active })
  live.current = { pending, onAction, active }
  useEffect(() => {
    const flush = setInterval(() => {
      const { pending: busy, onAction: send, active: open } = live.current
      if (busy || !open || unsent.current === 0) return
      const count = Math.min(20, unsent.current)
      unsent.current -= count
      void send({ type, count })
    }, 250)
    return () => clearInterval(flush)
  }, [type])
  return unsent
}

function BalloonPlay({ view, disabled, pending, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'balloon' }> }) {
  const [localPumps, setLocalPumps] = useState(view.pumps)
  const unsent = useTapBatches('pump', view.status === 'pumping', pending, onAction)

  const pumps = Math.max(localPumps, view.pumps)
  const pumping = view.status === 'pumping'
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
        {view.status === 'popped' ? M.balloon.popped : M.balloon.tap(pumps)}
      </div>
      <p className={styles.playStatus}>{M.balloon.waiting(view.poppedCount)}</p>
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

function StealPlay({ view, players, selfId, disabled, pending, now, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'steal' }> }) {
  const nameOf = (id: string) => players.find(player => player.id === id)?.nickname ?? ''
  const stunned = now < view.selfStunnedUntil
  const shielded = now < view.selfShieldUntil
  const canSteal = !disabled && !pending && !stunned && now >= view.selfStealReadyAt
  const canShield = !disabled && !pending && !stunned && now >= view.selfShieldReadyAt
  const hit = view.lastHit
  return (
    <div className={styles.playArea}>
      <p role="status" className={styles.playHeadline}>{stunned ? M.steal.stunned : !hit ? M.steal.idle : hit.blocked ? M.steal.blocked(nameOf(hit.thiefId), nameOf(hit.targetId)) : M.steal.hit(nameOf(hit.thiefId), nameOf(hit.targetId))}</p>
      <div className={styles.bombCircle}>
        {players.filter(player => !player.retired).map(player => {
          const pot = view.pots[player.id] ?? 0
          const target = canSteal && player.id !== selfId
          return <motion.button type="button" key={player.id} disabled={!target} aria-label={M.steal.stealFrom(player.nickname, numberFormatter.format(pot))} whileTap={{ scale: .85 }}
            className={`${styles.bombSeat} ${target ? styles.bombSeatTarget : ''} ${player.id === selfId && shielded ? styles.seatShielded : ''}`} onClick={() => void onAction({ type: 'steal', targetId: player.id })}>
            <PlayerAvatar avatarId={player.avatarId} className="size-12" />
            <span className={styles.bombName}>{player.id === selfId ? TEXTS.leaderboard.you : player.nickname}</span>
            <span className={styles.seatPot}>{numberFormatter.format(pot)}</span>
          </motion.button>
        })}
      </div>
      <button type="button" disabled={!canShield} className={`daisy-btn ${styles.bigAction}`} onClick={() => void onAction({ type: 'shield' })}>{shielded ? M.steal.shieldOn : canShield || stunned ? M.steal.shield : M.steal.shieldWait}</button>
    </div>
  )
}

function DuelPlay({ view, players, participantCount, disabled, startedAt, clockOffsetMs, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'duel' }> }) {
  // shortcut: a reload restarts the local reaction clock, anchor it to the server if that gets abused.
  const [firedAt, setFiredAt] = useState<number | null>(null)
  const [localShot, setLocalShot] = useState<number | 'early' | null>(null)
  const signalAt = startedAt + view.signalOffsetMs

  useEffect(() => {
    let frame = 0
    const tick = () => {
      if (Date.now() + clockOffsetMs >= signalAt) setFiredAt(performance.now())
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [signalAt, clockOffsetMs])

  const early = view.selfEarly || localShot === 'early'
  const reaction = view.selfReactionMs ?? (typeof localShot === 'number' ? localShot : null)
  const done = early || reaction !== null
  const names = view.opponentIds.map(id => players.find(player => player.id === id)?.nickname ?? '').join(', ')

  function shoot() {
    if (disabled || done) return
    if (firedAt === null) {
      setLocalShot('early')
      navigator.vibrate?.(200)
      void onAction({ type: 'early' })
      return
    }
    const reactionMs = performance.now() - firedAt
    setLocalShot(reactionMs)
    void onAction({ type: 'shoot', reactionMs })
  }

  return (
    <div className={styles.playArea}>
      <p className={styles.playHeadline}>{M.duel.versus(names)}</p>
      <button type="button" className={`${styles.balloonStage} ${firedAt !== null && !done ? styles.duelFire : ''}`} disabled={disabled || done} aria-label={firedAt === null ? M.duel.wait : M.duel.fire} onPointerDown={event => { event.preventDefault(); shoot() }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); shoot() } }}>
        <span className={styles.duelFace}>{early ? '🙈' : reaction !== null ? '🤠' : firedAt === null ? '🤫' : '🔥'}</span>
      </button>
      <p role="status" className={styles.playHeadline}>{early ? M.duel.early : reaction !== null ? M.duel.yours((reaction / 1000).toFixed(3).replace('.', ',')) : firedAt === null ? M.duel.wait : M.duel.fire}</p>
      <p className={styles.playStatus}>{M.duel.waiting(view.shotCount, participantCount)}</p>
    </div>
  )
}

function TugPlay({ view, players, disabled, pending, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'tug' }> }) {
  const [localTugs, setLocalTugs] = useState(view.selfTugs)
  const unsent = useTapBatches('tug', true, pending, onAction)
  const tugs = Math.max(localTugs, view.selfTugs)
  const own = view.scores[view.selfTeam]
  const rival = view.scores[1 - view.selfTeam]
  const lead = own + rival ? (own - rival) / (own + rival) : 0

  function pull() {
    if (disabled) return
    unsent.current++
    setLocalTugs(tugs + 1)
  }
  const team = (ids: string[]) => ids.map(id => {
    const player = players.find(entry => entry.id === id)
    return player && <PlayerAvatar key={id} avatarId={player.avatarId} className="size-8" />
  })

  return (
    <div className={styles.playArea}>
      <div className={styles.tugTeams}>
        <div className={styles.tugTeam}>{team(view.teams[view.selfTeam])}<span>{M.tug.yourTeam}</span></div>
        <div className={`${styles.tugTeam} ${styles.tugTeamRival}`}>{team(view.teams[1 - view.selfTeam])}<span>{M.tug.rivalTeam}</span></div>
      </div>
      <button type="button" className={styles.balloonStage} disabled={disabled} aria-label={M.tug.pull} onPointerDown={event => { event.preventDefault(); pull() }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pull() } }}>
        <span className={styles.tugRope}><motion.span animate={{ x: lead * -110 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>🚩</motion.span></span>
      </button>
      <p role="status" className={styles.playHeadline}>{M.tug.tap(tugs)}</p>
    </div>
  )
}

function SplitPlay({ view, players, participantCount, disabled, onAction }: MinigamePlayProps & { view: Extract<MinigameView, { kind: 'split' }> }) {
  const [picked, setPicked] = useState<'split' | 'steal' | null>(null)
  const chosen = view.selfPick ?? picked
  const opponent = players.find(player => player.id === view.opponentId)
  const choose = (value: 'split' | 'steal') => { setPicked(value); void onAction({ type: 'pick', value }) }
  return (
    <div className={styles.playArea}>
      {opponent && <PlayerAvatar avatarId={opponent.avatarId} className="size-16" />}
      <p className={styles.playHeadline}>{opponent ? M.split.versus(opponent.nickname) : M.split.versusJerry}</p>
      <button type="button" disabled={disabled || chosen !== null} aria-pressed={chosen === 'split'} className={`daisy-btn ${styles.bigAction}`} onClick={() => choose('split')}>{M.split.share}</button>
      <button type="button" disabled={disabled || chosen !== null} aria-pressed={chosen === 'steal'} className={`daisy-btn ${styles.bigAction} ${styles.bigActionStop}`} onClick={() => choose('steal')}>{M.split.steal}</button>
      <p role="status" className={styles.playStatus}>{chosen ? `${chosen === 'split' ? M.split.chosenShare : M.split.chosenSteal} ` : ''}{M.split.waiting(view.pickedCount, participantCount)}</p>
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
    case 'steal': return <StealPlay {...props} view={view} />
    case 'duel': return <DuelPlay {...props} view={view} />
    case 'tug': return <TugPlay {...props} view={view} />
    case 'split': return <SplitPlay {...props} view={view} />
  }
}
