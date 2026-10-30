import { randomInt, randomUUID } from 'node:crypto'
import type { GamePhase } from '../../features/game/types'
import { WHEEL_SLICES, spinTrajectory, turnsPerPlayer, type FlashSnapshot, type MinigameKind, type MinigameResult, type MinigameSnapshot, type SpinTrajectory, type WheelSliceKind, type WheelSnapshot } from '../../features/game/wheel'
import { TEXTS } from '../../texts'
import { abort, availableQuestions, enter, GameRuleError, shuffle, suspend, type GameContent, type GameState, type TriviaQuestion } from './engine'
import { MINIGAMES, MINIGAME_KINDS } from './minigames'
import type { MinigameContext } from './minigames/types'

export interface WheelSpin {
  id: string
  playerId: string
  sliceIndex: number
  slice: WheelSliceKind
  trajectory: SpinTrajectory
  pointsBefore: number
  pointsAfter: number
  auto: boolean
}

export interface MinigameRun {
  runId: string
  kind: MinigameKind
  participantIds: string[]
  confirmedIds: string[]
  startedAt: number | null
  state: unknown
  results: MinigameResult[] | null
  lastActionIds: Record<string, string>
}

export interface FlashRun {
  id: string
  scope: 'all' | 'self'
  playerId: string
  category: string
  participantIds: string[]
  question: TriviaQuestion
  status: 'prepared' | 'open' | 'revealed'
  opensAt: number | null
  answers: Record<string, { optionId: string; receivedAt: number }>
  points: Record<string, number> | null
}

/** JSON serializable. `schedule` stays empty until the phase begins. */
export interface WheelState {
  schedule: string[]
  cursor: number
  turnId: string
  spin: WheelSpin | null
  startPoints: Record<string, number>
  bag: MinigameKind[]
  minigame: MinigameRun | null
  flash: FlashRun | null
  commentary: string | null
}

const WHEEL_PHASES: GamePhase[] = ['wheel_turn', 'wheel_spin', 'wheel_effect', 'minigame_intro', 'minigame_playing', 'minigame_results', 'flash_intro', 'flash_question', 'flash_reveal']
const DISCONNECTED_TURN_MS = 3_000
export const AUTO_SPIN_STRENGTH = .5
/** The stopped wheel stays on screen long enough to read the slice. */
export const SPIN_SETTLE_MS = 1_400

export const isWheelPhase = (phase: GamePhase) => WHEEL_PHASES.includes(phase)
const activeIds = (game: GameState) => game.players.filter(player => !player.retired).map(player => player.id)
const playerOf = (game: GameState, id: string) => game.players.find(player => player.id === id)!
const pick = <T>(items: readonly T[]): T => items[randomInt(items.length)]

export function createWheel(): WheelState {
  return { schedule: [], cursor: 0, turnId: randomUUID(), spin: null, startPoints: {}, bag: [], minigame: null, flash: null, commentary: null }
}

/** Fixed when the phase opens: later retirements skip their turns, not the plan. */
export function startWheel(game: GameState): void {
  const wheel = game.wheel!
  const ids = activeIds(game)
  const order = shuffle(ids)
  wheel.schedule = Array.from({ length: turnsPerPlayer(ids.length) }, () => order).flat()
  wheel.cursor = 0
  wheel.startPoints = Object.fromEntries(game.players.map(player => [player.id, player.points]))
}

export function beginTurn(game: GameState, now: number): void {
  const wheel = game.wheel!
  while (wheel.cursor < wheel.schedule.length && playerOf(game, wheel.schedule[wheel.cursor]).retired) wheel.cursor++
  wheel.turnId = randomUUID()
  wheel.spin = null
  wheel.minigame = null
  wheel.flash = null
  wheel.commentary = null
  if (wheel.cursor >= wheel.schedule.length) enter(game, 'wheel_summary', now, null)
  else enter(game, 'wheel_turn', now, game.config.wheelTurnMs)
}

function nextTurn(game: GameState, now: number): void {
  game.wheel!.cursor++
  beginTurn(game, now)
}

function applyEffect(points: number, slice: WheelSliceKind): number {
  switch (slice) {
    case 'plus': return points + 500
    case 'minus': return Math.max(0, points - 500)
    case 'double': return points * 2
    case 'half': return Math.floor(points / 2)
    default: return points
  }
}

function spinCommentary(slice: WheelSliceKind, nickname: string): string {
  const lines = TEXTS.wheel.commentary[slice]
  return pick(lines)(nickname)
}

/** The effect is saved with the draw, so a restart can neither repeat nor lose it. */
export function applySpin(game: GameState, strength: number, now: number, auto: boolean, sliceIndex = randomInt(WHEEL_SLICES.length)): void {
  const wheel = game.wheel!
  const player = playerOf(game, wheel.schedule[wheel.cursor])
  const slice = WHEEL_SLICES[sliceIndex]
  const pointsBefore = player.points
  player.points = applyEffect(pointsBefore, slice)
  const trajectory = spinTrajectory(sliceIndex, strength, now, (randomInt(201) - 100) / 100)
  wheel.spin = { id: randomUUID(), playerId: player.id, sliceIndex, slice, trajectory, pointsBefore, pointsAfter: player.points, auto }
  wheel.commentary = spinCommentary(slice, player.nickname)
  enter(game, 'wheel_spin', now, trajectory.durationMs + SPIN_SETTLE_MS)
}

export function spin(game: GameState, playerId: string, turnId: string, strength: number, now: number): void {
  const wheel = game.wheel
  if (!wheel || wheel.turnId !== turnId || game.phase !== 'wheel_turn') throw new GameRuleError('STALE_TURN', TEXTS.errors.staleTurn)
  if (wheel.schedule[wheel.cursor] !== playerId) throw new GameRuleError('NOT_YOUR_TURN', TEXTS.errors.notYourTurn)
  if (game.deadline !== null && now >= game.deadline) throw new GameRuleError('ACTION_TOO_LATE', TEXTS.errors.tooLate)
  applySpin(game, strength, now, false)
}

function nextMinigameKind(game: GameState): MinigameKind {
  const wheel = game.wheel!
  const eligible = (kind: MinigameKind) => MINIGAMES[kind].minPlayers <= activeIds(game).length
  if (!wheel.bag.some(eligible)) wheel.bag = shuffle(MINIGAME_KINDS)
  const kind = wheel.bag.find(eligible)!
  wheel.bag = wheel.bag.filter(entry => entry !== kind)
  return kind
}

function openMinigame(game: GameState, now: number): void {
  const wheel = game.wheel!
  wheel.minigame = { runId: randomUUID(), kind: nextMinigameKind(game), participantIds: activeIds(game), confirmedIds: [], startedAt: null, state: null, results: null, lastActionIds: {} }
  enter(game, 'minigame_intro', now, game.config.minigamePreviewMs)
}

function chooseFlashQuestion(game: GameState, content: GameContent): { question: TriviaQuestion; category: string } | null {
  const categories = shuffle(content.categories.filter(category => game.categoryIds.includes(category.id)))
  for (const category of categories) {
    const questions = availableQuestions(game, content, category.id)
    if (questions.length) return { question: structuredClone(pick(questions)), category: category.name }
  }
  return null
}

/** False when the catalog has nothing left, so the caller can move on. */
function openFlash(game: GameState, content: GameContent, scope: 'all' | 'self', playerId: string, now: number): boolean {
  const chosen = chooseFlashQuestion(game, content)
  if (!chosen) return false
  chosen.question.options = shuffle(chosen.question.options)
  game.usedQuestionIds.push(chosen.question.id)
  game.wheel!.flash = {
    id: randomUUID(), scope, playerId, category: chosen.category, question: chosen.question, status: 'prepared', opensAt: null, answers: {}, points: null,
    participantIds: scope === 'self' ? [playerId] : activeIds(game),
  }
  enter(game, 'flash_intro', now, game.config.flashIntroMs)
  return true
}

/** `connectedIds` is null after a restart, when nobody has had time to come back yet. */
function finishSpin(game: GameState, content: GameContent, connectedIds: Set<string> | null, now: number): void {
  const wheel = game.wheel!
  const current = wheel.spin!
  switch (current.slice) {
    case 'minigame': openMinigame(game, now); return
    case 'flash_all':
    case 'flash_self': {
      const scope = current.slice === 'flash_self' ? 'self' : 'all'
      if (scope === 'self' && connectedIds && !connectedIds.has(current.playerId)) { game.message = TEXTS.wheel.flashSkipped; nextTurn(game, now); return }
      if (!openFlash(game, content, scope, current.playerId, now)) { game.message = TEXTS.serverMessages.noMoreQuestions; nextTurn(game, now) }
      return
    }
    default: enter(game, 'wheel_effect', now, game.config.wheelEffectMs)
  }
}

function startMinigame(game: GameState, now: number): void {
  const run = game.wheel!.minigame!
  const definition = MINIGAMES[run.kind]
  run.participantIds = activeIds(game)
  run.state = definition.create(run.participantIds)
  run.startedAt = now
  run.lastActionIds = {}
  enter(game, 'minigame_playing', now, definition.durationMs)
}

function contextFor(game: GameState, run: MinigameRun, connectedIds: Set<string>): MinigameContext {
  const active = activeIds(game)
  return { activeIds: run.participantIds.filter(id => active.includes(id)), connectedIds, startedAt: run.startedAt! }
}

/** Prizes are clamped at zero and stored as really applied, so the show matches the board. */
function finishMinigame(game: GameState, now: number): void {
  const wheel = game.wheel!
  const run = wheel.minigame!
  const retired = new Set(game.players.filter(player => player.retired).map(player => player.id))
  const rows = MINIGAMES[run.kind].results(run.state, run.participantIds, retired)
  for (const row of rows) {
    const player = playerOf(game, row.playerId)
    const after = Math.max(0, player.points + row.points)
    row.points = after - player.points
    player.points = after
  }
  run.results = rows
  const winner = rows.find(row => row.points > 0)
  wheel.commentary = winner ? pick(TEXTS.wheel.commentary.minigameWinner)(playerOf(game, winner.playerId).nickname) : pick(TEXTS.wheel.commentary.minigameNobody)
  enter(game, 'minigame_results', now, game.config.minigameResultsMs)
}

export function confirmMinigame(game: GameState, playerId: string, runId: string): void {
  const run = game.wheel?.minigame
  if (!run || run.runId !== runId || game.phase !== 'minigame_intro') throw new GameRuleError('STALE_MINIGAME', TEXTS.errors.staleMinigame)
  if (run.confirmedIds.includes(playerId)) return
  run.confirmedIds.push(playerId)
  game.version++
}

export function minigameAction(game: GameState, playerId: string, runId: string, actionId: string, action: Record<string, unknown>, connectedIds: Set<string>, now: number): void {
  const run = game.wheel?.minigame
  if (!run || run.runId !== runId || game.phase !== 'minigame_playing') throw new GameRuleError('STALE_MINIGAME', TEXTS.errors.staleMinigame)
  if (!run.participantIds.includes(playerId)) throw new GameRuleError('NOT_IN_GAME', TEXTS.errors.notActivePlayer)
  if (game.deadline !== null && now >= game.deadline) throw new GameRuleError('ACTION_TOO_LATE', TEXTS.errors.tooLate)
  MINIGAMES[run.kind].act(run.state, contextFor(game, run, connectedIds), playerId, action, now)
  run.lastActionIds[playerId] = actionId
  game.version++
}

export function flashAnswer(game: GameState, playerId: string, flashId: string, optionId: string, now: number): void {
  const flash = game.wheel?.flash
  if (!flash || flash.id !== flashId || game.phase !== 'flash_question') throw new GameRuleError('STALE_QUESTION', TEXTS.errors.staleQuestion)
  if (!flash.participantIds.includes(playerId)) throw new GameRuleError('NOT_YOUR_TURN', TEXTS.errors.flashNotYours)
  if (game.deadline !== null && now >= game.deadline) throw new GameRuleError('ACTION_TOO_LATE', TEXTS.errors.tooLate)
  if (Object.hasOwn(flash.answers, playerId)) throw new GameRuleError('ALREADY_ANSWERED', TEXTS.errors.alreadyAnswered)
  if (!flash.question.options.some(option => option.id === optionId)) throw new GameRuleError('INVALID_OPTION', TEXTS.errors.optionNotProposed)
  flash.answers[playerId] = { optionId, receivedAt: now }
  game.version++
}

function closeFlash(game: GameState, now: number): void {
  const wheel = game.wheel!
  const flash = wheel.flash!
  flash.status = 'revealed'
  flash.points = {}
  for (const playerId of flash.participantIds) {
    const accepted = flash.answers[playerId]
    if (!accepted || accepted.optionId !== flash.question.correctOptionId) { flash.points[playerId] = 0; continue }
    const elapsed = Math.max(0, accepted.receivedAt - flash.opensAt!)
    const points = game.config.basePoints + Math.floor(game.config.speedPoints * Math.max(0, Math.min(1, 1 - elapsed / game.config.questionMs)))
    flash.points[playerId] = points
    playerOf(game, playerId).points += points
  }
  const winners = flash.participantIds.filter(id => flash.points![id] > 0)
  wheel.commentary = winners.length ? pick(TEXTS.wheel.commentary.minigameWinner)(playerOf(game, winners[0]).nickname) : pick(TEXTS.wheel.commentary.minigameNobody)
  enter(game, 'flash_reveal', now, game.config.flashRevealMs)
}

/** Run in the room's serialized transaction; at most one visible scene per call. */
export function advanceWheel(game: GameState, content: GameContent, connectedIds: Set<string>, now: number): boolean {
  const version = game.version
  const wheel = game.wheel!
  if (activeIds(game).length < 2) {
    abort(game, now, TEXTS.serverMessages.tooFewPlayers)
    return true
  }
  const expired = game.deadline !== null && now >= game.deadline
  switch (game.phase) {
    case 'wheel_turn': {
      if (activeIds(game).filter(id => connectedIds.has(id)).length < 2) {
        suspend(game, now, { target: 'phase', phase: 'wheel_turn' }, TEXTS.serverMessages.waitingPlayers)
        break
      }
      const spinnerAway = !connectedIds.has(wheel.schedule[wheel.cursor]) && now >= game.opensAt + DISCONNECTED_TURN_MS
      if (expired || spinnerAway) applySpin(game, AUTO_SPIN_STRENGTH, now, true)
      break
    }
    case 'wheel_spin': if (expired) finishSpin(game, content, connectedIds, now); break
    case 'wheel_effect':
    case 'minigame_results':
    case 'flash_reveal': if (expired) nextTurn(game, now); break
    case 'minigame_intro': {
      const run = wheel.minigame!
      const waiting = activeIds(game).filter(id => connectedIds.has(id) && !run.confirmedIds.includes(id))
      if (expired || (waiting.length === 0 && run.confirmedIds.length > 0)) startMinigame(game, now)
      break
    }
    case 'minigame_playing': {
      const run = wheel.minigame!
      const definition = MINIGAMES[run.kind]
      const context = contextFor(game, run, connectedIds)
      if (definition.advance(run.state, context, now)) game.version++
      if (expired || definition.isComplete(run.state, context)) finishMinigame(game, now)
      break
    }
    case 'flash_intro':
      if (expired) {
        const flash = wheel.flash!
        flash.status = 'open'
        flash.opensAt = now
        enter(game, 'flash_question', now, game.config.questionMs)
      }
      break
    case 'flash_question': {
      const flash = wheel.flash!
      const active = activeIds(game)
      if (expired || flash.participantIds.filter(id => active.includes(id)).every(id => Object.hasOwn(flash.answers, id))) closeFlash(game, now)
      break
    }
  }
  return game.version !== version
}

/** Confirmed effects survive; only what was being played on a phone is restarted. */
export function recoverWheel(game: GameState, content: GameContent, now: number): boolean {
  const wheel = game.wheel!
  if (game.phase === 'wheel_spin') {
    finishSpin(game, content, null, now)
    return true
  }
  if (game.phase === 'minigame_playing') {
    const run = wheel.minigame!
    wheel.minigame = { ...run, runId: randomUUID(), confirmedIds: [], startedAt: null, state: null, results: null, lastActionIds: {} }
    game.message = TEXTS.wheel.minigameRestarted
    enter(game, 'minigame_intro', now, game.config.minigamePreviewMs)
    return true
  }
  if (game.phase === 'flash_question') {
    const flash = wheel.flash!
    if (!openFlash(game, content, flash.scope, flash.playerId, now)) { game.message = TEXTS.serverMessages.noMoreQuestions; nextTurn(game, now) }
    else game.message = TEXTS.serverMessages.restartReplacement
    return true
  }
  return false
}

function minigameSnapshot(game: GameState, run: MinigameRun, selfId: string): MinigameSnapshot {
  const definition = MINIGAMES[run.kind]
  const playing = game.phase === 'minigame_playing' && run.state !== null
  return {
    runId: run.runId, kind: run.kind, participantIds: [...run.participantIds], confirmedIds: [...run.confirmedIds],
    view: playing ? structuredClone(definition.view(run.state, selfId)) : null,
    results: run.results ? structuredClone(run.results) : null,
    revealValue: run.results ? definition.revealValue(run.state) : null,
    lastActionId: run.lastActionIds[selfId] ?? null,
  }
}

function flashSnapshot(game: GameState, flash: FlashRun, selfId: string): FlashSnapshot {
  const visible = game.phase === 'flash_question' || game.phase === 'flash_reveal'
  const revealed = flash.status === 'revealed'
  return {
    id: flash.id, scope: flash.scope, playerId: flash.playerId, category: flash.category,
    participantCount: flash.participantIds.length, answeredCount: Object.keys(flash.answers).length,
    canAnswer: flash.participantIds.includes(selfId), selfAnswer: flash.answers[selfId]?.optionId ?? null,
    question: visible ? { prompt: flash.question.prompt, options: structuredClone(flash.question.options) } : null,
    reveal: revealed ? { correctOptionId: flash.question.correctOptionId, points: { ...flash.points }, sourceName: flash.question.sourceName, sourceUrl: flash.question.sourceUrl, license: flash.question.license } : null,
  }
}

/** Allowlist projection: secret limits, blast times and hidden picks never leave the server. */
export function wheelSnapshot(game: GameState, selfId: string): WheelSnapshot | null {
  const wheel = game.wheel
  if (!wheel?.schedule.length) return null
  const current = isWheelPhase(game.phase) ? wheel.spin : null
  return {
    turnId: wheel.turnId, spinNumber: Math.min(wheel.cursor + 1, wheel.schedule.length), totalSpins: wheel.schedule.length,
    spinnerId: wheel.schedule[wheel.cursor] ?? null,
    spin: current ? { id: current.id, playerId: current.playerId, sliceIndex: current.sliceIndex, slice: current.slice, trajectory: { ...current.trajectory }, pointsBefore: current.pointsBefore, pointsAfter: current.pointsAfter, auto: current.auto } : null,
    commentary: game.phase === 'wheel_spin' ? null : wheel.commentary,
    minigame: wheel.minigame ? minigameSnapshot(game, wheel.minigame, selfId) : null,
    flash: wheel.flash ? flashSnapshot(game, wheel.flash, selfId) : null,
  }
}
