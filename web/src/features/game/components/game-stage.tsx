'use client'

import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, EyeOff, LogOut, Radio, Send, Trophy, WandSparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ScoreBurst } from '../../../components/originkit/score-burst'
import { StaggerRise } from '../../../components/originkit/stagger-rise'
import type { RoomResponse } from '../../rooms/types'
import { PlayerAvatar } from '../../rooms/components/player-avatar'
import { useGameClock } from '../hooks/use-game-clock'
import { POWERS, shuffleAnswerOptions } from '../powers'
import { GAME_CONTINUE_PHASES, type GameAction, type GameCommandFields, type GamePhase, type GameSnapshot } from '../types'
import { BonusPlay } from './bonus-play'
import { BonusResults } from './bonus-results'
import { CategoryVoteResult } from './category-vote-result'
import { GameLeaderboard } from './game-leaderboard'
import { JerryPresenter } from './jerry-presenter'
import { PowerPreparation } from './power-preparation'
import { SwipeToContinue } from './swipe-to-continue'
import { WheelStage } from './wheel-stage'
import styles from '../styles/game-stage.module.css'
import powerStyles from '../styles/powers.module.css'
import { TEXTS } from '../../../texts'

export interface GameStageProps {
  game: GameSnapshot
  selfId: string
  roomCode: string
  isHost: boolean
  connected: boolean
  controlConflict?: boolean
  serverClockOffsetMs?: number
  onCommand: (action: GameAction, input?: GameCommandFields) => Promise<RoomResponse>
  onLeave: () => Promise<RoomResponse>
  onTakeControl?: () => Promise<RoomResponse>
}

const numberFormatter = new Intl.NumberFormat('it-IT')
const WHEEL_SCENES: GamePhase[] = ['phase1_summary', 'wheel_intro', 'wheel_summary', 'wheel_turn', 'wheel_spin', 'wheel_effect', 'minigame_intro', 'minigame_playing', 'minigame_results', 'flash_intro', 'flash_question', 'flash_reveal']
const WHEEL_TIMERS: GamePhase[] = ['wheel_turn', 'minigame_playing', 'flash_question']

export function GameStage({ game, selfId, roomCode, isHost, connected, controlConflict = false, serverClockOffsetMs, onCommand, onLeave, onTakeControl }: GameStageProps) {
  const self = game.players.find((player) => player.id === selfId)
  const isWheelScene = WHEEL_SCENES.includes(game.phase)
  // The wheel keeps turning across these two phases, so the scene must not remount.
  const wheelScene = game.phase === 'wheel_turn' || game.phase === 'wheel_spin' ? 'wheel' : game.phase
  const sceneKey = isWheelScene ? `${game.id}:${wheelScene}:${game.wheel?.turnId ?? ''}` : `${game.id}:${game.round}:${game.phase}:${game.phase.startsWith('bonus_') ? game.bonus?.runId ?? '' : game.question?.instanceId ?? game.powers.preparationId ?? ''}`
  const interactionKey = `${sceneKey}:${game.phase === 'bonus_playing' ? game.bonus?.question?.instanceId ?? 'finished' : isWheelScene ? game.phase : ''}`
  const currentScene = useRef(interactionKey)
  currentScene.current = interactionKey
  const sendingScene = useRef<string | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [spotlightIndex, setSpotlightIndex] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const scoreboard = useRef<HTMLDialogElement>(null)
  const leaveDialog = useRef<HTMLDialogElement>(null)
  const clock = useGameClock({ serverNow: game.serverNow, deadline: game.deadline, opensAt: game.opensAt, serverClockOffsetMs })
  // Before the first clock sync, the snapshot's own time anchors the shared wheel.
  const fallbackOffset = useRef(game.serverNow - Date.now())
  const clockOffsetMs = serverClockOffsetMs ?? fallbackOffset.current
  const callback = useRef(onCommand)
  callback.current = onCommand

  useEffect(() => {
    setSelection(null)
    setSpotlightIndex(0)
    setError('')
    setPending(false)
  }, [interactionKey])

  useEffect(() => {
    scoreboard.current?.close()
    heading.current?.focus({ preventScroll: true })
  }, [sceneKey])

  useEffect(() => {
    const synchronize = () => {
      if (document.visibilityState === 'visible') void callback.current('game:resume').catch(() => {})
    }
    document.addEventListener('visibilitychange', synchronize)
    return () => document.removeEventListener('visibilitychange', synchronize)
  }, [])

  async function send(action: GameAction, input?: GameCommandFields) {
    if (pending || sendingScene.current === interactionKey) return
    const submittedScene = interactionKey
    sendingScene.current = submittedScene
    setPending(true)
    setError('')
    try {
      const result = await onCommand(action, { matchId: game.id, roundId: game.round, ...input })
      if (currentScene.current === submittedScene && !result.ok) setError(result.error.message)
    } catch {
      if (currentScene.current === submittedScene) setError(TEXTS.errors.confirmationMissing)
    } finally {
      if (sendingScene.current === submittedScene) sendingScene.current = null
      if (currentScene.current === submittedScene) setPending(false)
    }
  }

  async function leave() {
    setPending(true)
    setError('')
    try {
      const result = await onLeave()
      if (!result.ok) { leaveDialog.current?.close(); setError(result.error.message) }
    } catch {
      leaveDialog.current?.close()
      setError(TEXTS.errors.leaveUnconfirmed)
    } finally { setPending(false) }
  }

  async function takeControl() {
    if (!onTakeControl || pending) return
    setPending(true)
    setError('')
    try {
      const result = await onTakeControl()
      if (!result.ok) setError(result.error.message)
    } catch {
      setError(TEXTS.errors.takeControlFailed)
    } finally { setPending(false) }
  }

  function submitSelection(event: FormEvent) {
    event.preventDefault()
    if (!selection) return
    if (game.phase === 'category_vote') void send('game:vote-category', { categoryId: selection })
    else if (game.phase === 'question' && game.question) void send('game:answer', { optionId: selection, questionInstanceId: game.question.instanceId })
  }

  const isVoting = game.phase === 'category_vote'
  const isQuestion = game.phase === 'question'
  const isBonusPlaying = game.phase === 'bonus_playing'
  const isBonus = game.phase.startsWith('bonus_')
  const effect = isQuestion ? game.powers.effect : null
  const power = POWERS.find(item => item.kind === effect?.kind)
  const powerFrom = game.players.find(player => player.id === effect?.fromId)
  const showCommentary = ['scoreboard', 'round_ready'].includes(game.phase) && game.commentary.length > 0
  const isReveal = game.phase === 'round_reveal'
  const manualPhase = GAME_CONTINUE_PHASES.find(phase => phase === game.phase) ?? null
  const enoughPlayers = game.players.filter((player) => player.connected && !player.retired).length >= 2
  const isInteractive = isVoting || isQuestion
  const confirmed = isVoting ? game.selfVote : game.selfAnswer
  const disabled = pending || !connected || controlConflict || !clock.isOpen || Boolean(confirmed) || !self || self.retired
  const options = isVoting ? game.candidates.map(category => ({ id: category.id, text: category.name, icon: category.icon })) : game.question?.options ?? []
  const displayedOptions = effect?.kind === 'shuffle' && game.question
    ? shuffleAnswerOptions(options, Math.min(clock.now, game.deadline ?? clock.now) - game.opensAt, `${game.question.instanceId}:${selfId}`)
    : options
  const selectedOption = options.find(option => option.id === (confirmed ?? selection))
  const titles = TEXTS.game.titles
  const wheelTitles = TEXTS.wheel.titles
  const spinner = game.players.find(player => player.id === game.wheel?.spinnerId)
  const flash = game.wheel?.flash
  const flashOwner = game.players.find(player => player.id === flash?.playerId)
  const wheelTitle = (): string => {
    switch (game.phase) {
      case 'phase1_summary': return wheelTitles.phase1_summary
      case 'wheel_intro': return wheelTitles.wheel_intro
      case 'wheel_summary': return wheelTitles.wheel_summary
      case 'wheel_turn': return game.wheel?.spinnerId === selfId ? wheelTitles.wheel_turn_self : wheelTitles.wheel_turn(spinner?.nickname ?? '')
      case 'wheel_spin': return wheelTitles.wheel_spin
      case 'minigame_intro':
      case 'minigame_playing': return game.wheel?.minigame ? TEXTS.wheel.minigames[game.wheel.minigame.kind].name : ''
      case 'minigame_results': return wheelTitles.minigame_results
      case 'wheel_effect': return game.wheel?.spin ? TEXTS.wheel.effectOf(game.players.find(player => player.id === game.wheel?.spin?.playerId)?.nickname ?? '') : ''
      default: return flash?.scope === 'self' ? flash.playerId === selfId ? wheelTitles.flash_self_you : wheelTitles.flash_self(flashOwner?.nickname ?? '') : wheelTitles.flash_all
    }
  }
  const finalPhase = game.phase === 'phase_complete' && Boolean(game.wheel)
  const sceneTitle = isWheelScene ? wheelTitle() : finalPhase ? wheelTitles.phase_complete : isVoting ? titles.category_vote
    : isBonus ? titles.bonus
      : isQuestion ? titles.question
      : game.phase === 'countdown' ? titles.countdown
        : game.phase === 'intro' ? titles.intro
          : game.phase === 'category_reveal' ? titles.category_reveal
            : isReveal ? titles.round_reveal
              : game.phase === 'scoreboard' ? titles.scoreboard
                : game.phase === 'round_ready' ? titles.round_ready(game.round + 1)
                  : game.phase === 'phase_complete' ? titles.phase_complete
                  : game.phase === 'suspended' ? titles.suspended : titles.aborted

  function panelMessage(): ReactNode {
    switch (game.phase) {
      case 'countdown': return <p>{TEXTS.jerry.countdown}</p>
      case 'intro': return <><p>{TEXTS.jerry.introGreeting}</p><ol className={styles.rules}>{TEXTS.jerry.introRules.map(rule => <li key={rule}>{rule}</li>)}</ol>{TEXTS.jerry.introNotes.map(note => <p key={note} className={styles.smallCopy}>{note}</p>)}</>
      case 'round_reveal': return <><p>{self?.roundPoints ? TEXTS.jerry.revealGained : TEXTS.jerry.revealMissed}</p><p className={styles.smallCopy}>{TEXTS.jerry.revealNote}</p></>
      case 'scoreboard': return <>{showCommentary ? game.commentary.slice(0, 2).map((line, index) => <p key={index}>{line}</p>) : <p>{game.round < game.totalRounds ? TEXTS.jerry.scoreboardMidGame : TEXTS.jerry.scoreboardLast}</p>}<p className={styles.smallCopy}>{game.round < game.totalRounds ? TEXTS.jerry.scoreboardNextRound : game.bonus ? TEXTS.jerry.scoreboardBonusNext : TEXTS.jerry.scoreboardSummaryNext}</p></>
      case 'round_ready': return <>{showCommentary ? game.commentary.slice(0, 2).map((line, index) => <p key={index}>{line}</p>) : <p>{TEXTS.jerry.roundReady}</p>}<p className={styles.smallCopy}>{TEXTS.jerry.roundReadyNote}</p></>
      case 'bonus_intro': return <><p>{TEXTS.jerry.bonusIntro}</p><ol className={styles.rules}>{TEXTS.jerry.bonusRules.map(rule => <li key={rule}>{rule}</li>)}</ol><p className={styles.smallCopy}>{TEXTS.jerry.bonusIntroNote}</p></>
      case 'bonus_results': return <><p>{game.bonus?.completedCount ? TEXTS.jerry.bonusResultsCompleted : TEXTS.jerry.bonusResultsNone}</p><p className={styles.smallCopy}>{TEXTS.jerry.bonusResultsNote}</p></>
      case 'phase_complete': return finalPhase ? <><p>{TEXTS.wheel.summary}</p><p className={styles.smallCopy}>{TEXTS.wheel.finalNote}</p></> : <><p>{game.bonus?.results ? TEXTS.jerry.phaseCompleteBonus : TEXTS.jerry.phaseComplete(game.totalRounds)}</p><p className={styles.smallCopy}>{TEXTS.jerry.phaseCompleteNote}</p></>
      case 'suspended': return <><p>{TEXTS.jerry.suspended}</p><p className={styles.smallCopy}>{TEXTS.jerry.suspendedNote}</p></>
      case 'aborted': return <><p>{TEXTS.jerry.aborted}</p><p className={styles.smallCopy}>{TEXTS.jerry.abortedNote}</p></>
      default: return null
    }
  }

  return (
    <main lang="it" className={styles.studio}>
      <div className={styles.studioInner}>
        <header className={styles.header}>
          <div className={styles.brandRow}><span className={styles.brand}>{TEXTS.game.brand}<span aria-hidden="true">.</span></span><span className={styles.roomCode}>{TEXTS.game.studio(roomCode)}</span><button type="button" className={`daisy-btn daisy-btn-ghost ${styles.iconButton}`} onClick={() => leaveDialog.current?.showModal()} aria-label={TEXTS.game.leaveLabel}><LogOut size={18} aria-hidden="true" /></button></div>
          <div className={styles.playerBar}>
            <div className={styles.personalScore}>{self && <PlayerAvatar avatarId={self.avatarId} className="size-10" />}<div><span className={styles.selfName}>{self?.nickname ?? TEXTS.game.yourGame}</span><strong>{numberFormatter.format(self?.points ?? 0)} <small>{TEXTS.game.points}</small></strong></div></div>
            <button type="button" className={`daisy-btn ${styles.scoreButton}`} onClick={() => scoreboard.current?.showModal()}><Trophy size={17} aria-hidden="true" /><span>{TEXTS.game.scoreboardButton}</span>{self && <span className={styles.rankPill}>{self.rank}°</span>}</button>
          </div>
        </header>

        {controlConflict ? <div role="status" className={`daisy-alert ${styles.connectionAlert} ${styles.controlAlert}`}><Radio size={19} aria-hidden="true" /><div><p>{TEXTS.game.controlConflict}</p><p className={styles.controlDetail}>{manualPhase ? TEXTS.game.controlManual : TEXTS.game.controlTimed}</p></div>{onTakeControl && <button type="button" className={`daisy-btn ${styles.controlButton}`} disabled={pending} onClick={() => void takeControl()}>{pending ? TEXTS.game.wait : TEXTS.game.continueHere}</button>}</div>
          : !connected && <div role="status" className={`daisy-alert ${styles.connectionAlert}`}><Radio size={19} aria-hidden="true" /><span>{manualPhase ? TEXTS.game.reconnectingManual : TEXTS.game.reconnectingTimed}</span></div>}
        {error && <div role="alert" className={`daisy-alert ${styles.errorAlert}`}>{error}</div>}

        <section key={sceneKey} className={`${styles.scene} ${isInteractive || isBonusPlaying ? styles.interactiveScene : ''}`} aria-labelledby="game-scene-title">
          <div className={styles.sceneMeta}><span className={`daisy-badge ${styles.phaseBadge}`}>{isWheelScene || finalPhase ? (game.wheel && !manualPhase && !finalPhase ? TEXTS.wheel.badge(game.wheel.spinNumber, game.wheel.totalSpins) : TEXTS.wheel.badgeIntro) : isBonus ? TEXTS.game.badgeBonus : game.phase === 'round_ready' ? TEXTS.game.badgeNextRound(game.round + 1, game.totalRounds) : game.round ? TEXTS.game.badgeRound(game.round, game.totalRounds) : TEXTS.game.badgeTrivia}</span><span className={styles.onAir}><Radio size={13} aria-hidden="true" /> {connected ? TEXTS.game.onAir : TEXTS.game.offAir}</span></div>
          <h1 id="game-scene-title" ref={heading} tabIndex={-1} aria-describedby={isQuestion && game.question ? 'current-question-prompt' : undefined} className={styles.title}>{isWheelScene ? <StaggerRise key={sceneTitle} text={sceneTitle} /> : sceneTitle}</h1>

          {game.deadline !== null && game.phase !== 'countdown' && (!isWheelScene || (WHEEL_TIMERS.includes(game.phase) && game.wheel?.minigame?.view?.kind !== 'timer')) && <div className={styles.timerBlock}><div className={styles.timerLabel}><span>{game.phase === 'wheel_turn' ? TEXTS.wheel.timerTurn : game.phase === 'minigame_playing' ? TEXTS.wheel.timerPlay : game.phase === 'flash_question' ? TEXTS.wheel.timerFlash : isVoting ? TEXTS.game.timer.vote : isQuestion ? TEXTS.game.timer.question : isBonusPlaying ? TEXTS.game.timer.bonus : game.phase === 'category_reveal' ? TEXTS.game.timer.powers : game.phase === 'suspended' ? TEXTS.game.timer.suspended : TEXTS.game.timer.other}</span><span className={styles.timerNumber}><Clock3 size={15} aria-hidden="true" /><span role="timer" aria-label={TEXTS.game.timer.secondsLeft(clock.seconds)} aria-live="off">{clock.seconds}<small>s</small></span></span></div><progress className={`daisy-progress ${styles.timerProgress}`} value={clock.remainingPercent} max={100} aria-label={TEXTS.game.timer.progressLabel} /></div>}

          {isWheelScene ? <WheelStage game={game} selfId={selfId} now={Math.max(clock.now, game.serverNow)} clockOffsetMs={clockOffsetMs} connected={connected} controlConflict={controlConflict} pending={pending} send={send} /> : isBonusPlaying && game.bonus ? <BonusPlay bonus={game.bonus} now={Math.max(clock.now, game.serverNow)} disabled={!connected || controlConflict || !clock.isOpen || !self || self.retired} pending={pending} onAnswer={(optionId, questionInstanceId) => void send('game:bonus-answer', { optionId, questionInstanceId, bonusRunId: game.bonus!.runId })} /> : isInteractive ? (
            <form onSubmit={submitSelection} className={styles.selectionForm} aria-describedby={isVoting ? 'category-vote-rule' : undefined}>
              {isVoting ? <div id="category-vote-rule" className={styles.votingRule}>
                <span className={`daisy-badge ${styles.votingBadge}`}>{TEXTS.game.voteBadge}</span>
                <p><strong>{TEXTS.game.voteRuleStrong}</strong> {TEXTS.game.voteRule}</p>
                <p className={styles.votingHint}>{TEXTS.game.voteHint}</p>
              </div> : <p className={styles.instructions}>{TEXTS.game.answerInstructions}</p>}
              {power && <div role="status" className={`daisy-alert ${powerStyles.effect}`}><WandSparkles size={22} aria-hidden="true" /><div><strong>{TEXTS.game.powerHit(powerFrom?.nickname ?? TEXTS.game.powerHitFallback, power.name)}</strong><p>{power.description} {TEXTS.game.powerHitTime}</p></div></div>}
              {isQuestion && game.question && <div className={styles.questionBox}><span className={styles.eyebrow}>{game.category?.name ?? TEXTS.game.defaultCategory}{game.question.language !== 'it' && game.question.language !== 'it-IT' ? ` · ${game.question.language.toUpperCase()}` : ''}</span><h2 id="current-question-prompt" className={styles.questionText}>{game.question.prompt}</h2></div>}
              <div className={isVoting ? styles.categoryChoices : styles.answerChoices} role="group" aria-label={isVoting ? TEXTS.game.categoriesLabel : TEXTS.game.answersLabel}>
                {displayedOptions.map(option => {
                  const index = options.findIndex(original => original.id === option.id)
                  if (effect?.kind === 'spotlight' && index !== spotlightIndex) return null
                  const chosen = (confirmed ?? selection) === option.id
                  const hiddenByFog = effect?.kind === 'fog' && !effect.revealedOptionIds.includes(option.id)
                  return <button type="button" key={option.id} disabled={disabled} aria-pressed={hiddenByFog ? undefined : chosen} aria-label={hiddenByFog ? TEXTS.game.fogReveal(String.fromCharCode(65 + index)) : undefined} className={`daisy-btn ${styles.choice} ${chosen ? styles.selectedChoice : ''} ${effect?.kind === 'spotlight' ? powerStyles.spotlight : ''}`} onClick={() => {
                    if (hiddenByFog && game.question) { void send('game:clear-power', { questionInstanceId: game.question.instanceId, optionId: option.id }); return }
                    setSelection(option.id); setError('')
                  }}><span className={styles.optionLetter}>{isVoting && 'icon' in option && option.icon ? option.icon as string : String.fromCharCode(65 + index)}</span><span className={styles.optionText}>{hiddenByFog ? TEXTS.game.fogHidden : option.text}</span>{hiddenByFog ? <EyeOff size={21} aria-hidden="true" /> : chosen && <Check size={21} className={styles.choiceCheck} aria-hidden="true" />}</button>
                })}
              </div>
              {effect?.kind === 'spotlight' && <><div className={powerStyles.spotlightControls}><button type="button" disabled={disabled || spotlightIndex === 0} className={`daisy-btn ${powerStyles.navigation}`} aria-label={TEXTS.game.spotlightPrevious} onClick={() => setSpotlightIndex(index => index - 1)}><ArrowLeft size={20} aria-hidden="true" /></button><span role="status" aria-live="polite">{TEXTS.game.spotlightPosition(spotlightIndex + 1, options.length)}</span><button type="button" disabled={disabled || spotlightIndex === options.length - 1} className={`daisy-btn ${powerStyles.navigation}`} aria-label={TEXTS.game.spotlightNext} onClick={() => setSpotlightIndex(index => index + 1)}><ArrowRight size={20} aria-hidden="true" /></button></div>{selectedOption && <p role="status" className={styles.smallCopy}>{TEXTS.game.spotlightChosen(String.fromCharCode(65 + options.indexOf(selectedOption)))}</p>}</>}
              <div className={styles.confirmation} aria-live="polite">
                {confirmed ? <p className={styles.confirmedMessage}><CheckCircle2 size={21} aria-hidden="true" />{isVoting ? TEXTS.game.votedFor(selectedOption?.text ?? TEXTS.game.votedFallback) : TEXTS.game.answerConfirmed}</p>
                  : <button type="submit" disabled={disabled || !selection} className={`daisy-btn ${styles.confirmButton}`}>{pending ? <><span className="daisy-loading daisy-loading-spinner daisy-loading-sm" aria-hidden="true" /> {TEXTS.game.sending}</> : <><Send size={18} aria-hidden="true" />{isVoting ? TEXTS.game.confirmVote : TEXTS.game.confirmAnswer}</>}</button>}
                {!clock.isOpen && !confirmed && <p className={styles.smallCopy}>{clock.now < game.opensAt ? TEXTS.game.windowOpening : TEXTS.game.timeUp}</p>}
                <p className={styles.participantCount}>{isVoting
                  ? TEXTS.game.votesReceived(game.votedCount)
                  : TEXTS.game.answersReceived(game.answeredCount, game.players.filter((player) => !player.retired).length)}</p>
              </div>
            </form>
          ) : (
            <>
              {game.phase === 'countdown' && <p role="status"><span className="daisy-loading daisy-loading-spinner daisy-loading-md" aria-hidden="true" /> {TEXTS.game.studioPreparing}</p>}
              {game.phase === 'category_reveal'
                ? <CategoryVoteResult game={game} selfId={selfId} elapsedMs={Math.max(clock.now, game.serverNow) - game.opensAt} />
                : <JerryPresenter compact={game.phase !== 'intro'}>{panelMessage()}</JerryPresenter>}
              {manualPhase && <div className="my-6">
                <SwipeToContinue label={manualPhase === 'intro' ? TEXTS.game.swipeStart : manualPhase === 'bonus_intro' ? TEXTS.game.swipeBonus : manualPhase === 'bonus_results' ? TEXTS.game.swipeSummary : TEXTS.game.swipeNextRound}
                  pending={pending} disabled={!connected || controlConflict || !self || self.retired || (manualPhase !== 'bonus_results' && !enoughPlayers)}
                  onContinue={() => send('game:continue', { expectedPhase: manualPhase })} />
                <p className={styles.smallCopy} role="status">{enoughPlayers || manualPhase === 'bonus_results' ? TEXTS.game.swipeAnyone : TEXTS.game.swipeWaiting}</p>
              </div>}
              {game.phase === 'category_reveal' && <PowerPreparation game={game} selfId={selfId} disabled={!connected || controlConflict || !clock.isOpen || !self || self.retired} pending={pending} onCommand={send} />}
              {game.phase === 'bonus_results' && game.bonus?.results && <BonusResults results={game.bonus.results} players={game.players} selfId={selfId} target={game.bonus.target} />}
              {isReveal && game.question && game.reveal && <div className={styles.resultCard}><span className={styles.eyebrow}>{TEXTS.game.correctAnswer}</span><p className={styles.correctAnswer}><CheckCircle2 size={23} aria-hidden="true" />{game.question.options.find((option) => option.id === game.reveal?.correctOptionId)?.text ?? TEXTS.game.solutionFallback}</p>{game.reveal.explanation && <p className={styles.explanation}>{game.reveal.explanation}</p>}<ScoreBurst active={Boolean(self?.roundPoints)} trigger={`${game.id}:${game.round}`}><p className={styles.roundGain}>+{numberFormatter.format(self?.roundPoints ?? 0)}<span>{TEXTS.game.pointsForYou}</span></p></ScoreBurst><p className={styles.answerFeedback}>{!game.selfAnswer ? TEXTS.game.noAnswer : game.selfAnswer === game.reveal.correctOptionId ? TEXTS.game.rightAnswer : TEXTS.game.wrongAnswer}</p><p className={styles.source}>{TEXTS.game.source} <a href={game.reveal.sourceUrl} target="_blank" rel="noopener noreferrer">{game.reveal.sourceName}</a> · {game.reveal.license}</p></div>}
              {['intro', 'round_reveal', 'scoreboard', 'round_ready', 'phase_complete', 'suspended', 'aborted'].includes(game.phase) && <section className={styles.board} aria-labelledby="board-heading"><div className={styles.boardHeading}><Trophy size={20} aria-hidden="true" /><h2 id="board-heading">{game.phase === 'phase_complete' ? TEXTS.game.phaseLeaderboard : TEXTS.game.leaderboard}</h2></div><GameLeaderboard players={game.players} selfId={selfId} showGains={isReveal || game.phase === 'scoreboard' || game.phase === 'round_ready'} showBreakdown={game.phase === 'phase_complete' && !finalPhase && Boolean(game.bonus?.results)} showWheelBreakdown={finalPhase} /></section>}
              {game.phase === 'round_ready' && <p className={powerStyles.inventory}><strong>{TEXTS.game.inventory(game.powers.inventory.length)}</strong> {game.powers.inventory.length ? game.powers.inventory.map(card => POWERS.find(item => item.kind === card.kind)?.name).join(', ') : TEXTS.game.inventoryEmpty}</p>}
              {game.message && <p className={styles.serverMessage} role="status">{game.message}</p>}
              {(game.phase === 'phase_complete' || game.phase === 'aborted') && <div className={styles.endActions}>{isHost ? <button type="button" className={`daisy-btn ${styles.confirmButton}`} disabled={pending || !connected || controlConflict} onClick={() => void send('game:return-lobby')}>{pending ? TEXTS.game.returning : TEXTS.game.returnToRoom}</button> : <p className={styles.smallCopy}>{TEXTS.game.hostCanReturn}</p>}</div>}
            </>
          )}
        </section>
        <footer className={styles.footer}><span>{isWheelScene || finalPhase ? TEXTS.wheel.footer : TEXTS.game.footerLeft}</span><span>{TEXTS.game.footerRight}</span></footer>
      </div>

      {process.env.NODE_ENV === 'development' && <div className="fixed right-2 bottom-2 z-40 flex gap-1">
        <button type="button" className="daisy-btn daisy-btn-xs" disabled={pending} onClick={() => void send('game:dev-skip', { devTarget: 'bonus' })}>{TEXTS.dev.skipBonus}</button>
        <button type="button" className="daisy-btn daisy-btn-xs" disabled={pending} onClick={() => void send('game:dev-skip', { devTarget: 'wheel' })}>{TEXTS.dev.skipWheel}</button>
      </div>}

      <dialog ref={scoreboard} className={`daisy-modal ${styles.dialog}`} aria-labelledby="scoreboard-dialog-title"><div className={`daisy-modal-box ${styles.dialogBox}`}><div className={styles.dialogHeading}><h2 id="scoreboard-dialog-title">{TEXTS.game.leaderboard}</h2><form method="dialog"><button className={`daisy-btn daisy-btn-ghost ${styles.dialogClose}`} aria-label={TEXTS.game.closeScoreboard}><X size={20} aria-hidden="true" /></button></form></div><p className={styles.smallCopy}>{manualPhase ? TEXTS.game.dialogManual : game.deadline !== null ? TEXTS.game.dialogTimed : TEXTS.game.dialogStatic}</p><GameLeaderboard players={game.players} selfId={selfId} /><form method="dialog" className="mt-4"><button className={`daisy-btn ${styles.dialogReturn}`}>{TEXTS.game.backToGame}</button></form></div><form method="dialog" className="daisy-modal-backdrop"><button aria-label={TEXTS.game.closeScoreboard}>{TEXTS.game.close}</button></form></dialog>
      <dialog ref={leaveDialog} className={`daisy-modal ${styles.dialog}`} aria-labelledby="leave-dialog-title"><div className={`daisy-modal-box ${styles.dialogBox}`}><h2 id="leave-dialog-title" className={styles.dialogTitle}>{TEXTS.game.leaveTitle}</h2><p className={styles.smallCopy}>{TEXTS.game.leaveCopy}</p><div className={styles.leaveActions}><form method="dialog"><button className={`daisy-btn ${styles.dialogReturn}`} disabled={pending}>{TEXTS.game.stay}</button></form><button type="button" className={`daisy-btn ${styles.leaveButton}`} disabled={pending || !connected || controlConflict} onClick={() => void leave()}>{pending ? TEXTS.game.leaving : TEXTS.game.leave}</button></div></div><form method="dialog" className="daisy-modal-backdrop"><button aria-label={TEXTS.game.stay} disabled={pending}>{TEXTS.game.close}</button></form></dialog>
    </main>
  )
}
