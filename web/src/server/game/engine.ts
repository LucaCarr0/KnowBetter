import { randomInt, randomUUID } from 'node:crypto'
import { GAME_CONTINUE_PHASES, GAME_DEFAULTS, type GameCategory, type GameConfig, type GameContinuePhase, type GameDevTarget, type GameOption, type GamePhase, type GameSnapshot } from '../../features/game/types'
import type { AvatarId } from '../../features/rooms/data/avatars'
import { MAX_POWER_CARDS, POWERS, powerDropProbability, type PowerCard, type PowerEffect } from '../../features/game/powers'
import { buildJerryCommentary } from './commentary'
import type { BonusQuestion } from '../content/bonus-catalog'
import { advanceBonus, bonusSnapshot, consumeBonusAnswer, createBonus, selectBonusQuestions, startBonus, validBonusQuestions, type BonusState } from './bonus'
import { advanceWheel, beginTurn, createWheel, isWheelPhase, openMinigame, recoverWheel, startWheel, wheelSnapshot, type WheelState } from './wheel'
import { GameRuleError } from './errors'
import { TEXTS } from '../../texts'

export { GameRuleError }

/** Private server content. Never import this module into a client component. */
export interface TriviaQuestion {
  id: string
  categoryId: string
  prompt: string
  options: GameOption[]
  correctOptionId: string
  difficulty: string
  language: string
  sourceUrl: string
  sourceName: string
  license: string
  sourceId: string
  sourceCategory?: string
  playable?: boolean
  explanation?: string
}

export interface GameContent { categories: GameCategory[]; questions: TriviaQuestion[]; bonusQuestions?: BonusQuestion[] }
export interface GameRosterPlayer {
  id: string
  nickname: string
  avatarId: AvatarId
  points: number
  retired: boolean
}
export interface AcceptedAnswer { optionId: string; receivedAt: number; points: number | null; correct: boolean | null }
export interface QuestionInstance {
  id: string
  question: TriviaQuestion
  status: 'prepared' | 'open' | 'revealed' | 'voided'
  opensAt: number | null
  deadline: number | null
  closedAt: number | null
  answers: Record<string, AcceptedAnswer>
}
export interface GameRound {
  number: number
  candidates: GameCategory[]
  votes: Record<string, { categoryId: string; receivedAt: number }>
  category: GameCategory | null
  categoryVotes: Record<string, number> | null
  selectionReason: GameSnapshot['selectionReason']
  questionInstances: QuestionInstance[]
  powerPlays?: (PowerEffect & { cardId: string; targetId: string })[]
  powerReadyIds?: string[]
  powersDealt?: boolean
  commentary?: string[]
}
type ResumablePhase = Exclude<GamePhase, 'suspended' | 'aborted' | 'phase_complete'>
interface Suspension {
  target: 'next_round' | 'replacement' | 'phase'
  phase?: ResumablePhase
}

/** JSON serializable authoritative state, persisted together with command receipts. */
export interface GameState {
  id: string
  schemaVersion: 1
  config: GameConfig
  phase: GamePhase
  round: number
  version: number
  opensAt: number
  deadline: number | null
  players: GameRosterPlayer[]
  categoryIds: string[]
  rounds: GameRound[]
  usedQuestionIds: string[]
  suspension: Suspension | null
  message: string | null
  powerInventories?: Record<string, PowerCard[]>
  /** Absent in matches created before the bonus was introduced. */
  bonus?: BonusState
  /** Absent in matches created before the wheel was introduced. */
  wheel?: WheelState
}

const copy = <T>(value: T): T => structuredClone(value)
const currentRound = (game: GameState) => game.rounds[game.rounds.length - 1]
const currentQuestion = (game: GameState) => currentRound(game)?.questionInstances.at(-1)
const activePlayers = (game: GameState) => game.players.filter(player => !player.retired)
const connectedCount = (game: GameState, connectedIds: Set<string>) => activePlayers(game).filter(player => connectedIds.has(player.id)).length
const letters = new Intl.Segmenter('it', { granularity: 'grapheme' })

export function scrambleAnswerWords(text: string): string {
  return text.replace(/\p{L}[\p{L}\p{M}]*/gu, word => {
    const characters = [...letters.segment(word)].map(part => part.segment)
    return characters.length < 4 ? word : characters[0] + characters.slice(1, -1).reverse().join('') + characters.at(-1)
  })
}

function choose<T>(items: T[]): T {
  return items[randomInt(items.length)]
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1)
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function dealPower(): PowerCard {
  return { id: randomUUID(), kind: choose([...POWERS]).kind }
}

/** Called once on opening a round, never on snapshots or reconnection. */
export function awardRoundPowers(game: GameState, roll: () => number = () => randomInt(1_000_000) / 1_000_000): void {
  const round = currentRound(game)
  if (!game.powerInventories || !round || round.powersDealt) return
  round.powersDealt = true
  if (game.round === 1) return
  const active = activePlayers(game)
  for (const player of active) {
    const inventory = game.powerInventories[player.id]
    const rank = active.filter(other => other.points > player.points).length + 1
    if (inventory.length < MAX_POWER_CARDS && roll() < powerDropProbability(rank, active.length)) inventory.push(dealPower())
  }
}

export function isPlayableQuestion(question: TriviaQuestion): boolean {
  if (question.playable === false) return false
  // Public catalogs also contain lengthy explanations embedded in prompts and
  // options. Preserve their originals in the DB, but keep the shared 15-second
  // question window readable on a phone.
  return Boolean(question.id && question.categoryId && question.prompt.trim() && question.language && question.sourceName && question.sourceUrl && question.license)
    && question.prompt.length <= 300
    && question.options.length === 4
    && question.options.every(option => option.text.length <= 120)
    && question.prompt.length + question.options.reduce((total, option) => total + option.text.length, 0) <= 600
    && new Set(question.options.map(option => option.id)).size === 4
    && new Set(question.options.map(option => option.text.trim().toLocaleLowerCase())).size === 4
    && question.options.every(option => Boolean(option.id && option.text.trim()))
    && question.options.some(option => option.id === question.correctOptionId)
}

export function availableQuestions(game: GameState, content: GameContent, categoryId: string): TriviaQuestion[] {
  const seen = new Set(game.usedQuestionIds)
  const unique = new Map<string, TriviaQuestion>()
  for (const question of content.questions) {
    if (question.categoryId === categoryId && !seen.has(question.id) && isPlayableQuestion(question)) unique.set(question.id, question)
  }
  return [...unique.values()]
}

export function enter(game: GameState, phase: GamePhase, now: number, duration: number | null): void {
  game.phase = phase
  game.opensAt = now
  game.deadline = duration === null ? null : now + duration
  game.version++
}

export function abort(game: GameState, now: number, message: string): void {
  game.message = message
  game.suspension = null
  enter(game, 'aborted', now, null)
}

export function suspend(game: GameState, now: number, suspension: Suspension, message: string): void {
  game.suspension = suspension
  game.message = message
  enter(game, 'suspended', now, game.config.suspensionMs)
}

function durationFor(game: GameState, phase: ResumablePhase): number | null {
  switch (phase) {
    case 'countdown': return game.config.countdownMs
    case 'intro':
    case 'round_ready':
    case 'bonus_intro':
    case 'bonus_results':
    case 'phase1_summary':
    case 'wheel_intro':
    case 'wheel_summary': return null
    case 'bonus_playing': return game.bonus?.config.durationMs ?? 60_000
    case 'category_vote': return game.config.voteMs
    case 'category_reveal': return game.config.categoryRevealMs
    case 'question': return game.config.questionMs
    case 'round_reveal': return game.config.roundRevealMs
    case 'scoreboard': return game.config.scoreboardMs
    case 'wheel_turn': return game.config.wheelTurnMs
    case 'wheel_spin': throw new Error('A saved spin moves on after a restart, it does not resume')
    case 'wheel_effect': return game.config.wheelEffectMs
    case 'minigame_intro': return game.config.minigamePreviewMs
    case 'minigame_results': return game.config.minigameResultsMs
    case 'flash_intro': return game.config.flashIntroMs
    case 'flash_reveal': return game.config.flashRevealMs
    case 'minigame_playing':
    case 'flash_question': throw new Error('Interrupted plays are restarted, not resumed')
  }
}

function prepareQuestion(game: GameState, content: GameContent, now: number): boolean {
  const round = currentRound(game)
  if (!round?.category) throw new Error('Round category is missing')
  const questions = availableQuestions(game, content, round.category.id)
  if (!questions.length) {
    abort(game, now, TEXTS.serverMessages.noMoreQuestions)
    return false
  }
  const question = copy(choose(questions))
  // One shared ordering for every phone, stored with the question instance.
  question.options = shuffle(question.options)
  game.usedQuestionIds.push(question.id)
  round.questionInstances.push({ id: randomUUID(), question, status: 'prepared', opensAt: null, deadline: null, closedAt: null, answers: {} })
  round.powerReadyIds = []
  for (const play of round.powerPlays ?? []) {
    play.revealedOptionIds = []
  }
  enter(game, 'category_reveal', now, game.config.categoryRevealMs)
  return true
}

function openRound(game: GameState, content: GameContent, connectedIds: Set<string>, now: number): void {
  if (connectedCount(game, connectedIds) < 2) {
    suspend(game, now, { target: 'next_round' }, TEXTS.serverMessages.waitingPlayers)
    return
  }
  const categories = content.categories.filter(category => game.categoryIds.includes(category.id) && availableQuestions(game, content, category.id).length > 0)
  if (categories.length < 3) {
    abort(game, now, TEXTS.serverMessages.noMoreCategories)
    return
  }
  game.round++
  game.rounds.push({ number: game.round, candidates: copy(shuffle(categories).slice(0, 3)), votes: {}, category: null, categoryVotes: null, selectionReason: null, questionInstances: [] })
  awardRoundPowers(game)
  enter(game, 'category_vote', now, game.config.voteMs)
}

function closeVote(game: GameState, content: GameContent, now: number): void {
  const round = currentRound(game)
  const totals = Object.fromEntries(round.candidates.map(category => [category.id, 0]))
  // Accepted votes remain valid if a player later disconnects or retires.
  for (const vote of Object.values(round.votes)) totals[vote.categoryId]++
  const maximum = Math.max(...Object.values(totals))
  const winners = round.candidates.filter(category => totals[category.id] === maximum)
  round.category = copy(choose(winners))
  round.categoryVotes = totals
  round.selectionReason = maximum === 0 ? 'abstention' : winners.length > 1 ? 'tie' : 'votes'
  prepareQuestion(game, content, now)
}

function closeQuestion(game: GameState, now: number): void {
  const instance = currentQuestion(game)
  if (!instance || instance.status !== 'open' || instance.opensAt === null) throw new Error('Open question is missing')
  instance.status = 'revealed'
  instance.closedAt = now
  const pointsBefore = new Map(game.players.map(player => [player.id, player.points]))
  for (const player of game.players) {
    const answer = instance.answers[player.id]
    if (!answer) continue
    answer.correct = answer.optionId === instance.question.correctOptionId
    const elapsed = Math.max(0, answer.receivedAt - instance.opensAt)
    answer.points = answer.correct ? game.config.basePoints + Math.floor(game.config.speedPoints * Math.max(0, Math.min(1, 1 - elapsed / game.config.questionMs))) : 0
    player.points += answer.points
  }
  const previous = game.rounds.at(-2)?.questionInstances.findLast(question => question.status === 'revealed')
  const outcome = (answer: AcceptedAnswer | undefined) => answer?.correct === true ? 'correct' as const : answer?.correct === false ? 'wrong' as const : 'missing' as const
  currentRound(game).commentary = buildJerryCommentary({
    round: game.round, totalRounds: game.config.rounds,
    players: game.players.map(player => ({
      id: player.id, nickname: player.nickname, retired: player.retired,
      pointsBefore: pointsBefore.get(player.id)!, pointsAfter: player.points,
      answer: outcome(instance.answers[player.id]), previousAnswer: previous ? outcome(previous.answers[player.id]) : null,
    })),
  })
  enter(game, 'round_reveal', now, game.config.roundRevealMs)
}

export function createGame(players: { id: string; nickname: string; avatarId: AvatarId }[], content: GameContent, now: number, config: Partial<GameConfig> = {}): GameState {
  const settings = { ...GAME_DEFAULTS, ...config }
  if (Object.values(settings).some(value => !Number.isSafeInteger(value) || value <= 0)) throw new GameRuleError('INVALID_GAME_CONFIG', TEXTS.errors.invalidGameConfig)
  if (players.length < 2 || players.length > 10 || new Set(players.map(player => player.id)).size !== players.length) throw new GameRuleError('NOT_ENOUGH_PLAYERS', TEXTS.errors.wrongPlayerCount)
  const game: GameState = {
    id: randomUUID(), schemaVersion: 1, config: settings, phase: 'countdown', round: 0, version: 1, opensAt: now, deadline: now + settings.countdownMs,
    players: players.map(player => ({ ...player, points: 0, retired: false })), categoryIds: [], rounds: [], usedQuestionIds: [], suspension: null, message: null,
    powerInventories: Object.fromEntries(players.map(player => [player.id, [dealPower()]])),
  }
  // Requiring five unique questions in each eligible category guarantees three
  // candidates in every normal round, even if the same category always wins.
  game.categoryIds = [...new Set(content.categories.filter(category => availableQuestions(game, content, category.id).length >= settings.rounds).map(category => category.id))]
  if (game.categoryIds.length < 3) throw new GameRuleError('INSUFFICIENT_CONTENT', TEXTS.errors.insufficientContent(settings.rounds))
  const bonusQuestions = validBonusQuestions(content.bonusQuestions)
  if (bonusQuestions.length < 21) throw new GameRuleError('INSUFFICIENT_BONUS_CONTENT', TEXTS.errors.insufficientBonusStart)
  game.bonus = createBonus(bonusQuestions)
  game.wheel = createWheel()
  return game
}

function assertActor(game: GameState, playerId: string): void {
  const player = game.players.find(entry => entry.id === playerId)
  if (!player || player.retired) throw new GameRuleError('NOT_IN_GAME', TEXTS.errors.notActivePlayer)
}

function assertWindow(game: GameState, phase: GamePhase, now: number): void {
  if (game.phase !== phase) throw new GameRuleError('WRONG_GAME_PHASE', TEXTS.errors.wrongPhase)
  if (now < game.opensAt) throw new GameRuleError('ACTION_TOO_EARLY', TEXTS.errors.tooEarly)
  if (game.deadline === null || now >= game.deadline) throw new GameRuleError('ACTION_TOO_LATE', TEXTS.errors.tooLate)
}

/** Any active player may release a manual pause, only for the scene they saw. */
export function continueGame(game: GameState, playerId: string, content: GameContent, connectedIds: Set<string>, roundId: number, expectedPhase: GameContinuePhase, now: number): void {
  assertActor(game, playerId)
  if (!connectedIds.has(playerId)) throw new GameRuleError('PLAYER_OFFLINE', TEXTS.errors.playerOffline)
  if (roundId !== game.round) throw new GameRuleError('STALE_ROUND', TEXTS.errors.staleRound)
  if (!GAME_CONTINUE_PHASES.includes(expectedPhase) || game.phase !== expectedPhase) throw new GameRuleError('WRONG_GAME_PHASE', TEXTS.errors.screenEnded)
  if (now < game.opensAt) throw new GameRuleError('ACTION_TOO_EARLY', TEXTS.errors.screenNotStarted)
  if (expectedPhase === 'bonus_results') {
    enter(game, game.wheel ? 'phase1_summary' : 'phase_complete', now, null)
    return
  }
  if (expectedPhase === 'wheel_summary') {
    enter(game, 'phase_complete', now, null)
    return
  }
  if (connectedCount(game, connectedIds) < 2) throw new GameRuleError('NOT_ENOUGH_PLAYERS', TEXTS.serverMessages.waitingPlayers)
  if (expectedPhase === 'bonus_intro') {
    const bonus = game.bonus
    if (!bonus) throw new GameRuleError('WRONG_GAME_PHASE', TEXTS.errors.noBonus)
    if (!bonus.questions.length) {
      const questions = validBonusQuestions(content.bonusQuestions)
      if (questions.length < bonus.config.target) throw new GameRuleError('INSUFFICIENT_BONUS_CONTENT', TEXTS.errors.insufficientBonus)
      bonus.questions = selectBonusQuestions(questions, bonus.config.target)
    }
    startBonus(game, now)
    game.message = null
    enter(game, 'bonus_playing', now, bonus.config.durationMs)
  } else if (expectedPhase === 'phase1_summary') {
    if (!game.wheel) throw new GameRuleError('WRONG_GAME_PHASE', TEXTS.errors.screenEnded)
    startWheel(game)
    enter(game, 'wheel_intro', now, null)
  } else if (expectedPhase === 'wheel_intro') {
    beginTurn(game, now)
  } else openRound(game, content, connectedIds, now)
}

/** Development shortcut: the first screen of a later stage, with a fresh run of it. */
export function devSkip(game: GameState, target: GameDevTarget, now: number): void {
  game.round = game.config.rounds
  game.suspension = null
  game.message = null
  if (target === 'bonus') {
    game.bonus = { ...(game.bonus ?? createBonus([])), runId: randomUUID(), questions: [], participantIds: [], startedAt: null, progress: {}, results: null }
    enter(game, 'bonus_intro', now, null)
  } else {
    game.wheel = createWheel()
    startWheel(game)
    if (target === 'bet') openMinigame(game, now, 'bet')
    else enter(game, 'wheel_intro', now, null)
  }
}

/** Old persisted introductions and pending next-round checkpoints had timers. */
function recoverManualPause(game: GameState, now: number): boolean | null {
  const version = game.version
  if (game.phase === 'suspended' && game.suspension) {
    const { target, phase } = game.suspension
    if (target === 'next_round' || target === 'phase' && (phase === 'intro' || phase === 'round_ready')) {
      game.suspension = null
      game.message = null
      enter(game, phase === 'intro' || game.round === 0 ? 'intro' : 'round_ready', now, null)
    }
  }
  if ((GAME_CONTINUE_PHASES as readonly GamePhase[]).includes(game.phase)) {
    // Offline players can still return; retired players cannot rejoin the fixed
    // roster. Release an unplayable pause so the remaining group can use lobby.
    if (game.phase !== 'bonus_results' && game.phase !== 'wheel_summary' && activePlayers(game).length < 2) abort(game, now, TEXTS.serverMessages.tooFewPlayers)
    else if (game.deadline !== null) {
      game.deadline = null
      game.version++
    }
    return game.version !== version
  }
  return null
}

export function vote(game: GameState, playerId: string, categoryId: string, now: number): void {
  assertActor(game, playerId)
  assertWindow(game, 'category_vote', now)
  const round = currentRound(game)
  if (Object.hasOwn(round.votes, playerId)) throw new GameRuleError('ALREADY_VOTED', TEXTS.errors.alreadyVoted)
  if (!round.candidates.some(category => category.id === categoryId)) throw new GameRuleError('INVALID_CATEGORY', TEXTS.errors.categoryNotProposed)
  round.votes[playerId] = { categoryId, receivedAt: now }
  game.version++
}

export function answer(game: GameState, playerId: string, optionId: string, questionInstanceId: string, now: number): void {
  assertActor(game, playerId)
  const instance = currentQuestion(game)
  if (instance?.id !== questionInstanceId) throw new GameRuleError('STALE_QUESTION', TEXTS.errors.staleQuestion)
  assertWindow(game, 'question', now)
  if (Object.hasOwn(instance.answers, playerId)) throw new GameRuleError('ALREADY_ANSWERED', TEXTS.errors.alreadyAnswered)
  if (!instance.question.options.some(option => option.id === optionId)) throw new GameRuleError('INVALID_OPTION', TEXTS.errors.optionNotProposed)
  const effect = currentRound(game).powerPlays?.find(play => play.targetId === playerId)
  if (effect?.kind === 'fog' && !effect.revealedOptionIds.includes(optionId)) throw new GameRuleError('POWER_BLOCKED', TEXTS.errors.fogBlocked)
  instance.answers[playerId] = { optionId, receivedAt: now, points: null, correct: null }
  game.version++
}

export function bonusAnswer(game: GameState, playerId: string, optionId: string, questionInstanceId: string, bonusRunId: string, now: number): void {
  assertActor(game, playerId)
  const bonus = game.bonus
  if (!bonus || bonus.runId !== bonusRunId) throw new GameRuleError('STALE_BONUS', TEXTS.errors.staleBonus)
  assertWindow(game, 'bonus_playing', now)
  const progress = bonus.progress[playerId]
  if (!progress) throw new GameRuleError('NOT_IN_GAME', TEXTS.errors.notInBonus)
  if (progress.completedMs !== null) throw new GameRuleError('BONUS_COMPLETED', TEXTS.errors.bonusCompleted)
  if (progress.questionInstanceId !== questionInstanceId) throw new GameRuleError('STALE_QUESTION', TEXTS.errors.staleBonusQuestion)
  if (now >= progress.questionDeadline) throw new GameRuleError('ACTION_TOO_LATE', TEXTS.errors.bonusTooLate)
  if (!bonus.questions[progress.chain].options.some(option => option.id === optionId)) throw new GameRuleError('INVALID_OPTION', TEXTS.errors.bonusOptionNotProposed)
  consumeBonusAnswer(game, playerId, optionId, now)
}

function assertPreparation(game: GameState, playerId: string, questionInstanceId: string, now: number): GameRound {
  assertActor(game, playerId)
  assertWindow(game, 'category_reveal', now)
  if (currentQuestion(game)?.id !== questionInstanceId) throw new GameRuleError('STALE_QUESTION', TEXTS.errors.preparationEnded)
  const round = currentRound(game)
  if (round.powerReadyIds?.includes(playerId)) throw new GameRuleError('ALREADY_READY', TEXTS.errors.alreadyReady)
  return round
}

export function usePower(game: GameState, playerId: string, cardId: string, targetId: string, questionInstanceId: string, connectedIds: Set<string>, now: number): void {
  const round = assertPreparation(game, playerId, questionInstanceId, now)
  const inventory = game.powerInventories?.[playerId]
  const card = inventory?.find(card => card.id === cardId)
  if (!card || !inventory) throw new GameRuleError('POWER_NOT_OWNED', TEXTS.errors.powerNotOwned)
  if (round.powerPlays?.some(play => play.fromId === playerId)) throw new GameRuleError('POWER_ALREADY_USED', TEXTS.errors.powerAlreadyUsed)
  if (targetId === playerId || !game.players.some(player => player.id === targetId && !player.retired) || !connectedIds.has(targetId)) throw new GameRuleError('INVALID_TARGET', TEXTS.errors.invalidTarget)
  if (round.powerPlays?.some(play => play.targetId === targetId)) throw new GameRuleError('TARGET_PROTECTED', TEXTS.errors.targetProtected)
  round.powerPlays ??= []
  round.powerPlays.push({ cardId, kind: card.kind, fromId: playerId, targetId, revealedOptionIds: [] })
  inventory.splice(inventory.indexOf(card), 1)
  ;(round.powerReadyIds ??= []).push(playerId)
  game.version++
}

export function readyQuestion(game: GameState, playerId: string, questionInstanceId: string, now: number): void {
  const round = assertPreparation(game, playerId, questionInstanceId, now)
  ;(round.powerReadyIds ??= []).push(playerId)
  game.version++
}

export function clearPower(game: GameState, playerId: string, questionInstanceId: string, optionId: string | undefined, now: number): void {
  assertActor(game, playerId)
  assertWindow(game, 'question', now)
  const instance = currentQuestion(game)
  if (instance?.id !== questionInstanceId) throw new GameRuleError('STALE_QUESTION', TEXTS.errors.questionInactive)
  const effect = currentRound(game).powerPlays?.find(play => play.targetId === playerId)
  if (effect?.kind === 'fog') {
    if (!instance.question.options.some(option => option.id === optionId)) throw new GameRuleError('INVALID_OPTION', TEXTS.errors.missingRevealOption)
    if (effect.revealedOptionIds.includes(optionId!)) throw new GameRuleError('POWER_ALREADY_CLEARED', TEXTS.errors.alreadyRevealed)
    effect.revealedOptionIds.push(optionId!)
  } else throw new GameRuleError('NO_CLEARABLE_POWER', TEXTS.errors.nothingToClear)
  game.version++
}

/** Run in the room's serialized transaction; at most one visible scene per call. */
export function advance(game: GameState, content: GameContent, connectedIds: Set<string>, now: number): boolean {
  const version = game.version
  if (game.phase === 'aborted' || game.phase === 'phase_complete') return false
  const manualPause = recoverManualPause(game, now)
  if (manualPause !== null) return manualPause
  if (game.phase === 'bonus_playing') return advanceBonus(game, now)
  if (isWheelPhase(game.phase)) return advanceWheel(game, content, connectedIds, now)
  if (game.phase === 'countdown' && connectedCount(game, connectedIds) < 2) {
    abort(game, now, TEXTS.serverMessages.startCancelled)
    return true
  }
  if (game.phase === 'suspended') {
    if (game.deadline !== null && now >= game.deadline) abort(game, now, TEXTS.serverMessages.nobodyReturned)
    else if (connectedCount(game, connectedIds) >= 2 && game.suspension) {
      const suspension = game.suspension
      game.suspension = null
      game.message = null
      if (suspension.target === 'replacement') prepareQuestion(game, content, now)
      else if (suspension.phase) enter(game, suspension.phase, now, durationFor(game, suspension.phase))
    }
    return game.version !== version
  }
  const round = currentRound(game)
  const instance = currentQuestion(game)
  const allVoted = game.phase === 'category_vote' && activePlayers(game).every(player => Object.hasOwn(round.votes, player.id))
  const allAnswered = game.phase === 'question' && activePlayers(game).every(player => instance && Object.hasOwn(instance.answers, player.id))
  const allReady = game.phase === 'category_reveal' && activePlayers(game).every(player => round.powerReadyIds?.includes(player.id))
  const expired = game.deadline !== null && now >= game.deadline
  if (!expired && !allVoted && !allAnswered && !allReady) return false
  switch (game.phase) {
    case 'countdown': enter(game, 'intro', now, null); break
    case 'category_vote': closeVote(game, content, now); break
    case 'category_reveal': {
      if (!instance || instance.status !== 'prepared') throw new Error('Prepared question is missing')
      instance.status = 'open'
      instance.opensAt = now
      instance.deadline = now + game.config.questionMs
      enter(game, 'question', now, game.config.questionMs)
      break
    }
    case 'question': closeQuestion(game, now); break
    case 'round_reveal': enter(game, 'scoreboard', now, game.config.scoreboardMs); break
    case 'scoreboard':
      if (game.round >= game.config.rounds) enter(game, game.bonus ? 'bonus_intro' : 'phase_complete', now, null)
      else enter(game, 'round_ready', now, null)
      break
  }
  return game.version !== version
}

/** Preserve confirmed results; invalidate a question exposed before the restart. */
export function recoverGame(game: GameState, now: number, content?: GameContent): boolean {
  let powersUpdated = false
  const savedPowers = [...Object.values(game.powerInventories ?? {}).flat(), ...game.rounds.flatMap(round => round.powerPlays ?? [])]
  for (const power of savedPowers) {
    if ((power.kind as string) === 'locks') { power.kind = 'shuffle'; powersUpdated = true }
  }
  if (powersUpdated) game.version++
  if (game.phase === 'bonus_playing' && game.bonus) {
    game.bonus.runId = randomUUID()
    game.bonus.questions = []
    game.bonus.participantIds = []
    game.bonus.startedAt = null
    game.bonus.progress = {}
    game.bonus.results = null
    game.message = TEXTS.serverMessages.bonusRestarted
    enter(game, 'bonus_intro', now, null)
    return true
  }
  if (content && game.wheel && recoverWheel(game, content, now)) return true
  const manualPause = recoverManualPause(game, now)
  if (manualPause !== null) return manualPause || powersUpdated
  if (game.phase === 'phase_complete' || game.phase === 'aborted' || game.phase === 'suspended') return powersUpdated
  if (game.phase === 'countdown') {
    abort(game, now, TEXTS.serverMessages.startCancelledRestart)
    return true
  }
  const phase = game.phase
  if (phase === 'question') {
    const instance = currentQuestion(game)
    if (!instance || instance.status !== 'open') throw new Error('Interrupted question is missing')
    instance.status = 'voided'
    instance.closedAt = now
    suspend(game, now, { target: 'replacement' }, TEXTS.serverMessages.restartReplacement)
  } else {
    suspend(game, now, { target: 'phase', phase }, TEXTS.serverMessages.restartPhase)
  }
  return true
}

export function retire(game: GameState, playerId: string, _now: number): void {
  const player = game.players.find(entry => entry.id === playerId)
  if (!player || player.retired) return
  player.retired = true
  game.version++
}

/** Allowlist projection: no private answer key or opponents' submissions can leak. */
export function snapshot(game: GameState, selfId: string, connectedIds: Set<string>, now: number): GameSnapshot {
  const round = currentRound(game)
  const instance = currentQuestion(game)
  const showQuestion = instance && ['question', 'round_reveal', 'scoreboard', 'round_ready', 'phase_complete'].includes(game.phase) && instance.status !== 'voided'
  const revealed = showQuestion && instance.status === 'revealed'
  const effect = ['category_reveal', 'question'].includes(game.phase) ? round?.powerPlays?.find(play => play.targetId === selfId) : undefined
  const options = showQuestion ? copy(instance.question.options).map(option => ({
    ...option, text: !revealed && effect?.kind === 'scramble' ? scrambleAnswerWords(option.text)
      : !revealed && effect?.kind === 'fog' && !effect.revealedOptionIds.includes(option.id) ? '' : option.text,
  })) : []
  // While the wheel turns, its saved effect must not spoil the outcome on the board.
  const spinning = game.phase === 'wheel_spin' ? game.wheel?.spin : null
  const shownPoints = (player: GameRosterPlayer) => spinning?.playerId === player.id ? spinning.pointsBefore : player.points
  const sorted = game.players.map((player, index) => ({ player: { ...player, points: shownPoints(player) }, index })).sort((a, b) => b.player.points - a.player.points || a.index - b.index)
  let rank = 1
  const players = sorted.map(({ player }, index) => {
    if (index > 0 && player.points < sorted[index - 1].player.points) rank = index + 1
    const bonusResult = game.bonus?.results?.find(result => result.playerId === player.id)
    return { ...player, roundPoints: revealed ? instance.answers[player.id]?.points ?? 0 : 0, rank, connected: connectedIds.has(player.id) && !player.retired,
      ...(game.bonus ? { triviaPoints: bonusResult?.triviaPoints ?? player.points, bonusPoints: bonusResult?.bonusPoints ?? 0 } : {}),
      ...(game.wheel?.schedule.length ? { wheelDelta: player.points - (game.wheel.startPoints[player.id] ?? 0) } : {}),
    }
  })
  return {
    id: game.id, phase: game.phase, round: game.round, totalRounds: game.config.rounds, version: game.version,
    serverNow: now, opensAt: game.opensAt, deadline: game.deadline, players,
    candidates: round ? copy(round.candidates) : [], category: round?.category ? copy(round.category) : null,
    categoryVotes: round?.categoryVotes ? { ...round.categoryVotes } : null, selectionReason: round?.selectionReason ?? null,
    categoryVoters: round?.categoryVotes ? Object.fromEntries(round.candidates.map(category => [
      category.id, game.players.filter(player => round.votes[player.id]?.categoryId === category.id).map(player => player.id),
    ])) : null,
    question: showQuestion ? { id: instance.question.id, instanceId: instance.id, prompt: instance.question.prompt, options, language: instance.question.language } : null,
    selfVote: round?.votes[selfId]?.categoryId ?? null,
    selfAnswer: showQuestion ? instance.answers[selfId]?.optionId ?? null : null,
    answeredCount: showQuestion ? Object.keys(instance.answers).length : 0,
    votedCount: round ? Object.keys(round.votes).length : 0,
    reveal: revealed ? { correctOptionId: instance.question.correctOptionId, ...(instance.question.explanation ? { explanation: instance.question.explanation } : {}), sourceName: instance.question.sourceName, sourceUrl: instance.question.sourceUrl, license: instance.question.license } : null,
    message: game.message,
    bonus: bonusSnapshot(game, selfId),
    wheel: wheelSnapshot(game, selfId),
    commentary: revealed ? [...round?.commentary ?? []] : [],
    powers: {
      inventory: copy(game.powerInventories?.[selfId] ?? []),
      effect: effect ? { kind: effect.kind, fromId: effect.fromId, revealedOptionIds: [...effect.revealedOptionIds] } : null,
      used: round?.powerPlays?.some(play => play.fromId === selfId) ?? false,
      ready: round?.powerReadyIds?.includes(selfId) ?? false,
      readyCount: round?.powerReadyIds?.filter(id => activePlayers(game).some(player => player.id === id)).length ?? 0,
      preparationId: game.phase === 'category_reveal' ? instance?.id ?? null : null,
      targetedIds: round?.powerPlays?.map(play => play.targetId) ?? [],
    },
  }
}
