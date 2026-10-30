'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, ListTree } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FireworksBurst } from '../../../components/originkit/fireworks-burst'
import { ScoreBurst } from '../../../components/originkit/score-burst'
import { PlayerAvatar } from '../../rooms/components/player-avatar'
import { createRequestId } from '../../rooms/services/room-client'
import type { GameAction, GameCommandFields, GameContinuePhase, GamePlayer, GameSnapshot } from '../types'
import { WHEEL_SLICES, type MinigameKind, type MinigameResult, type WheelSliceKind, type WheelSnapshot } from '../wheel'
import { CountUp } from './count-up'
import { FortuneWheel, SLICE_COLORS } from './fortune-wheel'
import { GameLeaderboard } from './game-leaderboard'
import { JerryPresenter } from './jerry-presenter'
import { MinigameDemo } from './minigame-demo'
import { MinigamePlay } from './minigame-play'
import { SwipeUpCard } from './swipe-up-card'
import { TEXTS } from '../../../texts'
import gameStyles from '../styles/game-stage.module.css'
import styles from '../styles/wheel.module.css'

const W = TEXTS.wheel
const numberFormatter = new Intl.NumberFormat('it-IT')
const sliceCounts = WHEEL_SLICES.reduce<Partial<Record<WheelSliceKind, number>>>((counts, slice) => ({ ...counts, [slice]: (counts[slice] ?? 0) + 1 }), {})

export interface WheelStageProps {
  game: GameSnapshot
  selfId: string
  now: number
  clockOffsetMs: number
  connected: boolean
  controlConflict: boolean
  pending: boolean
  send: (action: GameAction, input?: GameCommandFields) => Promise<void>
}

export function WheelStage(props: WheelStageProps) {
  const { game, selfId, connected, controlConflict, pending, send } = props
  const wheel = game.wheel ?? null
  const self = game.players.find(player => player.id === selfId)
  const blocked = !connected || controlConflict || !self || self.retired
  const enoughPlayers = game.players.filter(player => player.connected && !player.retired).length >= 2
  const swipe = (expectedPhase: GameContinuePhase) => send('game:continue', { expectedPhase })

  switch (game.phase) {
    case 'phase1_summary':
      return <>
        <JerryPresenter compact><p>{TEXTS.jerry.phaseCompleteBonus}</p><p className={gameStyles.smallCopy}>{W.phase1Note}</p></JerryPresenter>
        <motion.div layout className={gameStyles.board}><GameLeaderboard players={game.players} selfId={selfId} showBreakdown /></motion.div>
        <ManualSwipe disabled={blocked || pending || !enoughPlayers} waiting={!enoughPlayers} onConfirm={() => swipe('phase1_summary')}><div className={styles.miniWheel}><FortuneWheel trajectory={null} canSpin={false} onSpin={() => {}} clockOffsetMs={props.clockOffsetMs} idle /></div></ManualSwipe>
      </>
    case 'wheel_intro':
      return <>
        <JerryPresenter compact><p>{W.intro}</p><ol className={gameStyles.rules}>{W.introRules.map(rule => <li key={rule}>{rule}</li>)}</ol></JerryPresenter>
        <ManualSwipe disabled={blocked || pending || !enoughPlayers} waiting={!enoughPlayers} onConfirm={() => swipe('wheel_intro')}><div className={styles.miniWheel}><FortuneWheel trajectory={null} canSpin={false} onSpin={() => {}} clockOffsetMs={props.clockOffsetMs} idle /></div></ManualSwipe>
        <SliceLegend />
      </>
    case 'wheel_summary':
      return <div className={styles.celebrate}>
        <FireworksBurst bursts={6} />
        <JerryPresenter compact><p>{W.summary}</p></JerryPresenter>
        <div className={gameStyles.board}><GameLeaderboard players={game.players} selfId={selfId} showWheelBreakdown /></div>
        <ManualSwipe disabled={blocked || pending} waiting={false} onConfirm={() => swipe('wheel_summary')}><p className={styles.summaryCard}>🏆</p></ManualSwipe>
      </div>
  }
  if (!wheel) return null
  switch (game.phase) {
    case 'wheel_turn':
    case 'wheel_spin': return <SpinScene {...props} wheel={wheel} disabled={blocked} />
    case 'wheel_effect': return <EffectScene game={game} wheel={wheel} selfId={selfId} />
    case 'minigame_intro': return <PreviewScene {...props} wheel={wheel} disabled={blocked} />
    case 'minigame_playing': return wheel.minigame?.view ? <>
      <MinigamePlay view={wheel.minigame.view} players={game.players} selfId={selfId} participantCount={wheel.minigame.participantIds.length} disabled={blocked || !wheel.minigame.participantIds.includes(selfId)} pending={pending} now={props.now} startedAt={game.opensAt} clockOffsetMs={props.clockOffsetMs}
        onAction={action => send('game:minigame-action', { minigameRunId: wheel.minigame!.runId, actionId: createRequestId(), minigameAction: action })} />
    </> : null
    case 'minigame_results': return <ResultsScene game={game} wheel={wheel} selfId={selfId} />
    case 'flash_intro':
    case 'flash_question':
    case 'flash_reveal': return <FlashScene {...props} wheel={wheel} disabled={blocked} />
    default: return null
  }
}

function ManualSwipe({ children, disabled, waiting, onConfirm }: { children: React.ReactNode; disabled: boolean; waiting: boolean; onConfirm: () => Promise<void> }) {
  return <>
    <SwipeUpCard hint={W.swipeUp} buttonLabel={W.swipeUpContinue} disabled={disabled} onConfirm={onConfirm}>{children}</SwipeUpCard>
    <p className={gameStyles.smallCopy} role="status">{waiting ? W.swipeWaiting : W.swipeUpAnyone}</p>
  </>
}

function SliceLegend() {
  return (
    <details className={styles.legend}>
      <summary><ListTree size={16} aria-hidden="true" />{W.legendOpen}</summary>
      <ul>
        {(Object.keys(W.sliceNames) as WheelSliceKind[]).map(kind => <li key={kind}>
          <span className={styles.legendSwatch} style={{ background: SLICE_COLORS[kind] }} aria-hidden="true">{W.sliceWheelLabels[kind]}</span>
          <span>{W.sliceNames[kind]}</span>
          <small>{sliceCounts[kind]}/{WHEEL_SLICES.length}</small>
        </li>)}
      </ul>
    </details>
  )
}

function TurnOrder({ game, wheel }: { game: GameSnapshot; wheel: WheelSnapshot }) {
  const spinner = game.players.find(player => player.id === wheel.spinnerId)
  if (!spinner) return null
  return (
    <motion.div className={styles.spinnerChip} initial={{ scale: .6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 20 }}>
      <PlayerAvatar avatarId={spinner.avatarId} className="size-9" />
      <strong>{spinner.nickname}</strong>
    </motion.div>
  )
}

function SpinScene({ game, wheel, selfId, clockOffsetMs, disabled, send }: WheelStageProps & { wheel: WheelSnapshot; disabled: boolean }) {
  const isSpinner = wheel.spinnerId === selfId
  const spinner = game.players.find(player => player.id === wheel.spinnerId)
  const [landed, setLanded] = useState(false)
  const spin = wheel.spin
  useEffect(() => setLanded(false), [wheel.turnId])
  const canSpin = isSpinner && !disabled && game.phase === 'wheel_turn'

  return (
    <div className={styles.spinScene}>
      <TurnOrder game={game} wheel={wheel} />
      <FortuneWheel trajectory={spin?.trajectory ?? null} canSpin={canSpin} clockOffsetMs={clockOffsetMs} onLanded={() => setLanded(true)}
        onSpin={strength => void send('game:spin', { turnId: wheel.turnId, spinStrength: strength })} />
      <div className={styles.spinCaption} aria-live="polite">
        {landed && spin
          ? <motion.p className={styles.landedName} style={{ background: SLICE_COLORS[spin.slice] }} initial={{ scale: .4, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 460, damping: 14 }}>{W.sliceNames[spin.slice]}</motion.p>
          : spin?.auto ? <p>{W.autoSpin}</p>
            : !spin && <p>{isSpinner ? W.hintSpinner : W.hintWatch(spinner?.nickname ?? '')}</p>}
      </div>
      <SliceLegend />
    </div>
  )
}

function EffectScene({ game, wheel, selfId }: { game: GameSnapshot; wheel: WheelSnapshot; selfId: string }) {
  const spin = wheel.spin
  const reduced = useReducedMotion()
  if (!spin) return null
  const player = game.players.find(entry => entry.id === spin.playerId)
  const gain = spin.pointsAfter > spin.pointsBefore
  const isSelf = spin.playerId === selfId

  return (
    <div className={styles.effectScene}>
      {spin.slice === 'double' && <FireworksBurst bursts={5} />}
      <motion.div className={styles.effectBadge} style={{ background: SLICE_COLORS[spin.slice] }} initial={{ scale: .3, rotate: -14 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 13 }}>{W.sliceNames[spin.slice]}</motion.div>
      <motion.div className={styles.effectPlayer} animate={reduced || gain || spin.pointsAfter === spin.pointsBefore ? {} : { x: [0, -9, 9, -6, 6, 0] }} transition={{ duration: .5, delay: .45 }}>
        {player && <PlayerAvatar avatarId={player.avatarId} className="size-20" />}
        <span>{isSelf ? TEXTS.leaderboard.you : player?.nickname}</span>
      </motion.div>
      <ScoreBurst active={gain} trigger={spin.id}>
        <div className={styles.effectScore}>
          {spin.slice === 'half' && !reduced && spin.pointsBefore > 0 ? <HalfSplit before={spin.pointsBefore} after={spin.pointsAfter} /> : <CountUp from={spin.pointsBefore} to={spin.pointsAfter} delayMs={350} />}
          <small>{TEXTS.game.points}</small>
        </div>
      </ScoreBurst>
      {spin.slice === 'minus' && !reduced && spin.pointsBefore > 0 && <div className={styles.fallingCoins} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} style={{ left: `${10 + index * 10}%`, animationDelay: `${.35 + index * .05}s` }}>🪙</span>)}</div>}
      {wheel.commentary && <JerryPresenter compact><p>{wheel.commentary}</p></JerryPresenter>}
    </div>
  )
}

/** The score breaks in two; the lost half falls off the stage. */
function HalfSplit({ before, after }: { before: number; after: number }) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(true), 1_100)
    return () => clearTimeout(timeout)
  }, [])
  if (settled) return <CountUp from={after} to={after} durationMs={1} />
  const text = numberFormatter.format(before)
  return <span className={styles.halfSplit}>
    <span className={styles.halfKeep} aria-hidden="true">{text}</span>
    <span className={styles.halfFall} aria-hidden="true">{text}</span>
  </span>
}

function PreviewScene({ game, wheel, selfId, now, disabled, pending, send }: WheelStageProps & { wheel: WheelSnapshot; disabled: boolean }) {
  const run = wheel.minigame
  if (!run) return null
  const copy = W.minigames[run.kind]
  const confirmed = run.confirmedIds.includes(selfId)
  const waitingFor = run.participantIds.filter(id => game.players.find(player => player.id === id && player.connected && !player.retired))
  const left = game.deadline === null ? 0 : Math.max(0, Math.ceil((game.deadline - now) / 1000))

  return (
    <div className={styles.previewScene}>
      {confirmed ? <motion.div className={styles.previewCard} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}><MinigameDemo kind={run.kind} /></motion.div>
        : <SwipeUpCard hint={W.previewConfirm} buttonLabel={W.previewConfirmButton} disabled={disabled || pending} onConfirm={() => send('game:minigame-confirm', { minigameRunId: run.runId })}>
          <div className={styles.previewCard}><MinigameDemo kind={run.kind} /></div>
        </SwipeUpCard>}
      <ul className={styles.previewRules}>{copy.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
      <div className={styles.readyRow} aria-label={W.previewCount(run.confirmedIds.length, waitingFor.length)}>
        {game.players.filter(player => run.participantIds.includes(player.id) && !player.retired).map(player => {
          const ready = run.confirmedIds.includes(player.id)
          return <motion.span key={player.id} className={`${styles.readySeat} ${ready ? styles.readySeatOn : ''}`} animate={ready ? { scale: [1, 1.25, 1] } : { scale: 1 }}>
            <PlayerAvatar avatarId={player.avatarId} className="size-10" />
            {ready && <CheckCircle2 size={16} className={styles.readyMark} aria-hidden="true" />}
          </motion.span>
        })}
      </div>
      <p role="status" className={gameStyles.smallCopy}>{confirmed ? W.previewConfirmed : W.previewDeadline(left)} {W.previewCount(run.confirmedIds.length, waitingFor.length)}</p>
      {game.message && <p className={gameStyles.serverMessage} role="status">{game.message}</p>}
    </div>
  )
}

function resultDetail(kind: MinigameKind, row: MinigameResult): string {
  if (row.detail === null) return ''
  switch (kind) {
    case 'timer': return W.minigames.timer.detail((row.detail / 1000).toFixed(2).replace('.', ','))
    case 'numbers': return W.minigames.numbers.detail((row.detail / 1000).toFixed(2).replace('.', ','))
    case 'balloon': return W.minigames.balloon.detail(row.detail)
    case 'chests': return W.minigames.chests.detail(numberFormatter.format(row.detail))
    case 'highest': return W.minigames.highest.detail(row.detail)
    case 'bomb': return W.minigames.bomb.detail(row.detail)
    case 'steal': return W.minigames.steal.detail(numberFormatter.format(row.detail))
    case 'duel': return W.minigames.duel.detail((row.detail / 1000).toFixed(3).replace('.', ','))
    case 'tug': return W.minigames.tug.detail(row.detail)
    case 'split': return row.detail ? W.minigames.split.stole : W.minigames.split.shared
  }
}

function ResultsScene({ game, wheel, selfId }: { game: GameSnapshot; wheel: WheelSnapshot; selfId: string }) {
  const run = wheel.minigame
  if (!run?.results) return null
  const won = (run.results.find(row => row.playerId === selfId)?.points ?? 0) > 0
  const reveal = run.revealValue === null ? null
    : run.kind === 'timer' ? W.minigames.timer.reveal((run.revealValue / 1000).toFixed(2).replace('.', ','))
      : run.kind === 'balloon' ? W.minigames.balloon.reveal(run.revealValue) : null
  return (
    <div className={styles.celebrate}>
      {won && <FireworksBurst bursts={3} />}
      <p className={styles.resultKind}>{W.minigames[run.kind].name}</p>
      {reveal && <motion.p className={styles.resultReveal} initial={{ scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>{reveal}</motion.p>}
      <ResultRows results={run.results} players={game.players} selfId={selfId} detail={row => resultDetail(run.kind, row)} />
      {wheel.commentary && <JerryPresenter compact><p>{wheel.commentary}</p></JerryPresenter>}
    </div>
  )
}

function ResultRows({ results, players, selfId, detail }: { results: MinigameResult[]; players: GamePlayer[]; selfId: string; detail: (row: MinigameResult) => string }) {
  return (
    <ol className={styles.resultList}>
      {results.map((row, index) => {
        const player = players.find(entry => entry.id === row.playerId)
        const order = results.length - 1 - index
        return <motion.li key={row.playerId} className={`${styles.resultRow} ${index === 0 && row.points > 0 ? styles.resultTop : ''} ${row.playerId === selfId ? styles.resultSelf : ''}`}
          initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 340, damping: 22, delay: order * .12 }}>
          <span className={styles.resultRank}>{row.rank}°</span>
          {player && <PlayerAvatar avatarId={player.avatarId} className="size-10" />}
          <span className={styles.resultName}>{player?.nickname}<small>{detail(row)}</small></span>
          <strong className={row.points < 0 ? styles.resultLoss : ''}><CountUp to={row.points} delayMs={order * 120 + 200} signed /></strong>
        </motion.li>
      })}
    </ol>
  )
}

function FlashScene({ game, wheel, selfId, disabled, pending, send }: WheelStageProps & { wheel: WheelSnapshot; disabled: boolean }) {
  const flash = wheel.flash
  const [picked, setPicked] = useState<string | null>(null)
  const seen = useRef(flash?.id)
  if (flash && seen.current !== flash.id) { seen.current = flash.id; setPicked(null) }
  if (!flash) return null
  const chosen = flash.selfAnswer ?? picked
  const owner = game.players.find(player => player.id === flash.playerId)

  if (game.phase === 'flash_intro') {
    return <div className={styles.flashIntro}>
      <motion.span className={styles.flashBolt} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 12 }} aria-hidden="true">{flash.scope === 'self' ? '🎯' : '⚡'}</motion.span>
      <motion.p className={styles.flashCategory} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .25 }}>{flash.category}</motion.p>
      {flash.scope === 'self' && flash.playerId !== selfId && <p className={gameStyles.smallCopy}>{W.flashWatching(owner?.nickname ?? '')}</p>}
    </div>
  }
  if (!flash.question) return null
  const reveal = flash.reveal
  const selfPoints = reveal?.points[selfId] ?? 0

  return (
    <div className={styles.flashScene}>
      <div className={gameStyles.questionBox}><span className={gameStyles.eyebrow}>{flash.category}</span><h2 className={gameStyles.questionText}>{flash.question.prompt}</h2></div>
      {!flash.canAnswer && !reveal && <p className={gameStyles.smallCopy}>{W.flashWatching(owner?.nickname ?? '')}</p>}
      <div className={gameStyles.answerChoices} role="group" aria-label={TEXTS.game.answersLabel}>
        {flash.question.options.map((option, index) => {
          const correct = reveal?.correctOptionId === option.id
          const wrong = Boolean(reveal) && chosen === option.id && !correct
          return <motion.button type="button" key={option.id} disabled={disabled || !flash.canAnswer || Boolean(chosen) || Boolean(reveal) || pending} aria-pressed={chosen === option.id}
            className={`daisy-btn ${gameStyles.choice} ${chosen === option.id ? gameStyles.selectedChoice : ''} ${correct ? styles.flashCorrect : ''} ${wrong ? styles.flashWrong : ''}`}
            initial={{ x: index % 2 ? 40 : -40, opacity: 0 }} animate={correct ? { x: 0, opacity: 1, scale: [1, 1.06, 1] } : { x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 24, delay: reveal ? 0 : index * .05, scale: { duration: .4 } }}
            onClick={() => { setPicked(option.id); void send('game:flash-answer', { flashId: flash.id, optionId: option.id }) }}>
            <span className={gameStyles.optionLetter}>{String.fromCharCode(65 + index)}</span><span className={gameStyles.optionText}>{option.text}</span>
          </motion.button>
        })}
      </div>
      {!reveal && <p role="status" className={gameStyles.participantCount}>{chosen ? `${W.flashAnswered} ` : ''}{TEXTS.game.answersReceived(flash.answeredCount, flash.participantCount)}</p>}
      {reveal && <>
        {flash.canAnswer && <ScoreBurst active={selfPoints > 0} trigger={flash.id}><p className={gameStyles.roundGain}>{selfPoints > 0 ? W.flashPoints(numberFormatter.format(selfPoints)) : !chosen ? W.flashNoAnswer : W.flashWrong}</p></ScoreBurst>}
        {wheel.commentary && <JerryPresenter compact><p>{wheel.commentary}</p></JerryPresenter>}
        <p className={gameStyles.source}>{TEXTS.game.source} <a href={reveal.sourceUrl} target="_blank" rel="noopener noreferrer">{reveal.sourceName}</a> · {reveal.license}</p>
      </>}
    </div>
  )
}
