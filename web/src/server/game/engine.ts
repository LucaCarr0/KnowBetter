import { randomInt, randomUUID } from 'node:crypto'
import { GAME_DEFAULTS, type GameCategory, type GameConfig, type GameContinuePhase, type GameOption, type GamePhase, type GameSnapshot } from '../../features/game/types'
import type { AvatarId } from '../../features/rooms/data/avatars'

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

export interface GameContent { categories: GameCategory[]; questions: TriviaQuestion[] }
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
}

export class GameRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'GameRuleError'
  }
}

const copy = <T>(value: T): T => structuredClone(value)
const currentRound = (game: GameState) => game.rounds[game.rounds.length - 1]
const currentQuestion = (game: GameState) => currentRound(game)?.questionInstances.at(-1)
const activePlayers = (game: GameState) => game.players.filter(player => !player.retired)
const connectedCount = (game: GameState, connectedIds: Set<string>) => activePlayers(game).filter(player => connectedIds.has(player.id)).length

function choose<T>(items: T[]): T {
  return items[randomInt(items.length)]
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1)
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
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

function availableQuestions(game: GameState, content: GameContent, categoryId: string): TriviaQuestion[] {
  const seen = new Set(game.usedQuestionIds)
  const unique = new Map<string, TriviaQuestion>()
  for (const question of content.questions) {
    if (question.categoryId === categoryId && !seen.has(question.id) && isPlayableQuestion(question)) unique.set(question.id, question)
  }
  return [...unique.values()]
}

function enter(game: GameState, phase: GamePhase, now: number, duration: number | null): void {
  game.phase = phase
  game.opensAt = now
  game.deadline = duration === null ? null : now + duration
  game.version++
}

function abort(game: GameState, now: number, message: string): void {
  game.message = message
  game.suspension = null
  enter(game, 'aborted', now, null)
}

function suspend(game: GameState, now: number, suspension: Suspension, message: string): void {
  game.suspension = suspension
  game.message = message
  enter(game, 'suspended', now, game.config.suspensionMs)
}

function durationFor(game: GameState, phase: ResumablePhase): number | null {
  switch (phase) {
    case 'countdown': return game.config.countdownMs
    case 'intro':
    case 'round_ready': return null
    case 'category_vote': return game.config.voteMs
    case 'category_reveal': return game.config.categoryRevealMs
    case 'question': return game.config.questionMs
    case 'round_reveal': return game.config.roundRevealMs
    case 'scoreboard': return game.config.scoreboardMs
  }
}

function prepareQuestion(game: GameState, content: GameContent, now: number): boolean {
  const round = currentRound(game)
  if (!round?.category) throw new Error('Round category is missing')
  const questions = availableQuestions(game, content, round.category.id)
  if (!questions.length) {
    abort(game, now, 'Non ci sono altre domande disponibili per questa categoria. I punti già assegnati sono conservati.')
    return false
  }
  const question = copy(choose(questions))
  // One shared ordering for every phone, stored with the question instance.
  question.options = shuffle(question.options)
  game.usedQuestionIds.push(question.id)
  round.questionInstances.push({ id: randomUUID(), question, status: 'prepared', opensAt: null, deadline: null, closedAt: null, answers: {} })
  enter(game, 'category_reveal', now, game.config.categoryRevealMs)
  return true
}

function openRound(game: GameState, content: GameContent, connectedIds: Set<string>, now: number): void {
  if (connectedCount(game, connectedIds) < 2) {
    suspend(game, now, { target: 'next_round' }, 'Aspettiamo almeno 2 giocatori connessi per continuare.')
    return
  }
  const categories = content.categories.filter(category => game.categoryIds.includes(category.id) && availableQuestions(game, content, category.id).length > 0)
  if (categories.length < 3) {
    abort(game, now, 'Il catalogo non ha più tre categorie disponibili. I punti già assegnati sono conservati.')
    return
  }
  game.round++
  game.rounds.push({ number: game.round, candidates: copy(shuffle(categories).slice(0, 3)), votes: {}, category: null, categoryVotes: null, selectionReason: null, questionInstances: [] })
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
  for (const player of game.players) {
    const answer = instance.answers[player.id]
    if (!answer) continue
    answer.correct = answer.optionId === instance.question.correctOptionId
    const elapsed = Math.max(0, answer.receivedAt - instance.opensAt)
    answer.points = answer.correct ? game.config.basePoints + Math.floor(game.config.speedPoints * Math.max(0, Math.min(1, 1 - elapsed / game.config.questionMs))) : 0
    player.points += answer.points
  }
  enter(game, 'round_reveal', now, game.config.roundRevealMs)
}

export function createGame(players: { id: string; nickname: string; avatarId: AvatarId }[], content: GameContent, now: number, config: Partial<GameConfig> = {}): GameState {
  const settings = { ...GAME_DEFAULTS, ...config }
  if (Object.values(settings).some(value => !Number.isSafeInteger(value) || value <= 0)) throw new GameRuleError('INVALID_GAME_CONFIG', 'La configurazione della partita non è valida.')
  if (players.length < 2 || players.length > 10 || new Set(players.map(player => player.id)).size !== players.length) throw new GameRuleError('NOT_ENOUGH_PLAYERS', 'Servono da 2 a 10 giocatori distinti per iniziare.')
  const game: GameState = {
    id: randomUUID(), schemaVersion: 1, config: settings, phase: 'countdown', round: 0, version: 1, opensAt: now, deadline: now + settings.countdownMs,
    players: players.map(player => ({ ...player, points: 0, retired: false })), categoryIds: [], rounds: [], usedQuestionIds: [], suspension: null, message: null,
  }
  // Requiring five unique questions in each eligible category guarantees three
  // candidates in every normal round, even if the same category always wins.
  game.categoryIds = [...new Set(content.categories.filter(category => availableQuestions(game, content, category.id).length >= settings.rounds).map(category => category.id))]
  if (game.categoryIds.length < 3) throw new GameRuleError('INSUFFICIENT_CONTENT', `Servono almeno 3 categorie con ${settings.rounds} domande valide ciascuna per iniziare.`)
  return game
}

function assertActor(game: GameState, playerId: string): void {
  const player = game.players.find(entry => entry.id === playerId)
  if (!player || player.retired) throw new GameRuleError('NOT_IN_GAME', 'Non fai parte dei concorrenti attivi di questa partita.')
}

function assertWindow(game: GameState, phase: GamePhase, now: number): void {
  if (game.phase !== phase) throw new GameRuleError('WRONG_GAME_PHASE', 'Questa azione non è disponibile nella fase attuale.')
  if (now < game.opensAt) throw new GameRuleError('ACTION_TOO_EARLY', 'Il tempo per questa azione non è ancora iniziato.')
  if (game.deadline === null || now >= game.deadline) throw new GameRuleError('ACTION_TOO_LATE', 'Il tempo disponibile è scaduto.')
}

/** Any active player may release a manual pause, only for the scene they saw. */
export function continueGame(game: GameState, playerId: string, content: GameContent, connectedIds: Set<string>, roundId: number, expectedPhase: GameContinuePhase, now: number): void {
  assertActor(game, playerId)
  if (!connectedIds.has(playerId)) throw new GameRuleError('PLAYER_OFFLINE', 'Ricollegati alla partita prima di continuare.')
  if (roundId !== game.round) throw new GameRuleError('STALE_ROUND', 'Questo round è già terminato. Attendi la schermata aggiornata.')
  if (!['intro', 'round_ready'].includes(expectedPhase) || game.phase !== expectedPhase) throw new GameRuleError('WRONG_GAME_PHASE', 'Questa schermata è già terminata. Attendi l’aggiornamento della partita.')
  if (now < game.opensAt) throw new GameRuleError('ACTION_TOO_EARLY', 'Questa schermata non è ancora iniziata.')
  if (connectedCount(game, connectedIds) < 2) throw new GameRuleError('NOT_ENOUGH_PLAYERS', 'Aspettiamo almeno 2 giocatori connessi per continuare.')
  openRound(game, content, connectedIds, now)
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
  if (game.phase === 'intro' || game.phase === 'round_ready') {
    // Offline players can still return; retired players cannot rejoin the fixed
    // roster. Release an unplayable pause so the remaining group can use lobby.
    if (activePlayers(game).length < 2) abort(game, now, 'Partita interrotta: sono rimasti meno di 2 concorrenti in gara. I punti sono conservati.')
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
  if (Object.hasOwn(round.votes, playerId)) throw new GameRuleError('ALREADY_VOTED', 'Hai già confermato il voto per questo round.')
  if (!round.candidates.some(category => category.id === categoryId)) throw new GameRuleError('INVALID_CATEGORY', 'Scegli una delle categorie proposte.')
  round.votes[playerId] = { categoryId, receivedAt: now }
  game.version++
}

export function answer(game: GameState, playerId: string, optionId: string, questionInstanceId: string, now: number): void {
  assertActor(game, playerId)
  const instance = currentQuestion(game)
  if (instance?.id !== questionInstanceId) throw new GameRuleError('STALE_QUESTION', 'Questa domanda non è più attiva. Attendi l’aggiornamento della partita.')
  assertWindow(game, 'question', now)
  if (Object.hasOwn(instance.answers, playerId)) throw new GameRuleError('ALREADY_ANSWERED', 'Hai già confermato una risposta per questa domanda.')
  if (!instance.question.options.some(option => option.id === optionId)) throw new GameRuleError('INVALID_OPTION', 'Scegli una delle risposte proposte.')
  instance.answers[playerId] = { optionId, receivedAt: now, points: null, correct: null }
  game.version++
}

/** Run in the room's serialized transaction; at most one visible scene per call. */
export function advance(game: GameState, content: GameContent, connectedIds: Set<string>, now: number): boolean {
  const version = game.version
  if (game.phase === 'aborted' || game.phase === 'phase_complete') return false
  const manualPause = recoverManualPause(game, now)
  if (manualPause !== null) return manualPause
  if (game.phase === 'countdown' && connectedCount(game, connectedIds) < 2) {
    abort(game, now, 'Avvio annullato: servono almeno 2 giocatori connessi.')
    return true
  }
  if (game.phase === 'suspended') {
    if (game.deadline !== null && now >= game.deadline) abort(game, now, 'Partita interrotta: non sono rientrati almeno 2 giocatori in tempo. I punti sono conservati.')
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
  const expired = game.deadline !== null && now >= game.deadline
  if (!expired && !allVoted && !allAnswered) return false
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
      if (game.round >= game.config.rounds) enter(game, 'phase_complete', now, null)
      else enter(game, 'round_ready', now, null)
      break
  }
  return game.version !== version
}

/** Preserve confirmed results; invalidate a question exposed before the restart. */
export function recoverGame(game: GameState, now: number): boolean {
  const manualPause = recoverManualPause(game, now)
  if (manualPause !== null) return manualPause
  if (game.phase === 'phase_complete' || game.phase === 'aborted' || game.phase === 'suspended') return false
  if (game.phase === 'countdown') {
    abort(game, now, 'Avvio annullato dopo il riavvio del server. La stanza può iniziare una nuova partita.')
    return true
  }
  const phase = game.phase
  if (phase === 'question') {
    const instance = currentQuestion(game)
    if (!instance || instance.status !== 'open') throw new Error('Interrupted question is missing')
    instance.status = 'voided'
    instance.closedAt = now
    suspend(game, now, { target: 'replacement' }, 'Il server è ripartito. Riprenderemo con una nuova domanda della stessa categoria quando saremo almeno in 2.')
  } else {
    suspend(game, now, { target: 'phase', phase }, 'Il server è ripartito. Aspettiamo almeno 2 giocatori per riprendere la partita.')
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
  const sorted = game.players.map((player, index) => ({ player, index })).sort((a, b) => b.player.points - a.player.points || a.index - b.index)
  let rank = 1
  const players = sorted.map(({ player }, index) => {
    if (index > 0 && player.points < sorted[index - 1].player.points) rank = index + 1
    return { ...player, roundPoints: revealed ? instance.answers[player.id]?.points ?? 0 : 0, rank, connected: connectedIds.has(player.id) && !player.retired }
  })
  return {
    id: game.id, phase: game.phase, round: game.round, totalRounds: game.config.rounds, version: game.version,
    serverNow: now, opensAt: game.opensAt, deadline: game.deadline, players,
    candidates: round ? copy(round.candidates) : [], category: round?.category ? copy(round.category) : null,
    categoryVotes: round?.categoryVotes ? { ...round.categoryVotes } : null, selectionReason: round?.selectionReason ?? null,
    question: showQuestion ? { id: instance.question.id, instanceId: instance.id, prompt: instance.question.prompt, options: copy(instance.question.options), language: instance.question.language } : null,
    selfVote: round?.votes[selfId]?.categoryId ?? null,
    selfAnswer: showQuestion ? instance.answers[selfId]?.optionId ?? null : null,
    answeredCount: showQuestion ? Object.keys(instance.answers).length : 0,
    votedCount: round ? Object.keys(round.votes).length : 0,
    reveal: revealed ? { correctOptionId: instance.question.correctOptionId, ...(instance.question.explanation ? { explanation: instance.question.explanation } : {}), sourceName: instance.question.sourceName, sourceUrl: instance.question.sourceUrl, license: instance.question.license } : null,
    message: game.message,
  }
}
