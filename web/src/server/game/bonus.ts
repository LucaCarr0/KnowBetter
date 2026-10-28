import { randomInt, randomUUID } from 'node:crypto'
import type { BonusResult, BonusSnapshot } from '../../features/game/types'
import { validateBonusQuestion, type BonusQuestion } from '../content/bonus-catalog'
import type { GameState } from './engine'

export interface BonusProgress {
  chain: number
  questionInstanceId: string
  questionDeadline: number
  completedMs: number | null
  /** Latest accepted tap; timeouts must not erase recovery of a lost acknowledgement. */
  lastConsumedInstanceId: string | null
  lastOutcome: 'advanced' | 'reset' | 'timeout' | null
}

export interface BonusState {
  runId: string
  config: { target: number; durationMs: number; questionMs: number }
  questions: BonusQuestion[]
  participantIds: string[]
  startedAt: number | null
  progress: Record<string, BonusProgress>
  results: BonusResult[] | null
}

export function validBonusQuestions(questions: BonusQuestion[] = []): BonusQuestion[] {
  const ids = new Set<string>()
  const prompts = new Set<string>()
  return questions.filter(question => {
    try { validateBonusQuestion(question) } catch { return false }
    const prompt = question.prompt.normalize('NFKC').trim().toLocaleLowerCase('it')
    if (question.playable === false || ids.has(question.id) || prompts.has(prompt)) return false
    ids.add(question.id)
    prompts.add(prompt)
    return true
  })
}

export function selectBonusQuestions(questions: BonusQuestion[], target: number): BonusQuestion[] {
  const pool = [...questions]
  for (let index = pool.length - 1; index > 0; index--) {
    const other = randomInt(index + 1)
    ;[pool[index], pool[other]] = [pool[other], pool[index]]
  }
  return structuredClone(pool.slice(0, target)).map(question => {
    // Opaque option IDs keep the private catalog's true/false convention off the wire.
    const options = question.options.map(option => ({ ...option, id: randomUUID() }))
    const correctOptionId = options[question.options.findIndex(option => option.id === question.correctOptionId)].id
    if (randomInt(2)) options.reverse()
    return { ...question, options, correctOptionId }
  })
}

export function createBonus(questions: BonusQuestion[]): BonusState {
  return {
    runId: randomUUID(), config: { target: 21, durationMs: 60_000, questionMs: 5_000 },
    questions: selectBonusQuestions(questions, 21), participantIds: [], startedAt: null, progress: {}, results: null,
  }
}

export function startBonus(game: GameState, now: number): void {
  const bonus = game.bonus!
  bonus.participantIds = game.players.filter(player => !player.retired).map(player => player.id)
  bonus.startedAt = now
  bonus.progress = Object.fromEntries(bonus.participantIds.map(id => [id, {
    chain: 0, questionInstanceId: randomUUID(), questionDeadline: now + bonus.config.questionMs,
    completedMs: null, lastConsumedInstanceId: null, lastOutcome: null,
  }]))
}

export function consumeBonusAnswer(game: GameState, playerId: string, optionId: string, now: number): void {
  const bonus = game.bonus!
  const progress = bonus.progress[playerId]
  const question = bonus.questions[progress.chain]
  progress.lastConsumedInstanceId = progress.questionInstanceId
  if (optionId === question.correctOptionId) {
    progress.chain = 0
    progress.lastOutcome = 'reset'
  } else {
    progress.chain++
    progress.lastOutcome = 'advanced'
  }
  if (progress.chain === bonus.config.target) progress.completedMs = now - bonus.startedAt!
  progress.questionInstanceId = randomUUID()
  progress.questionDeadline = now + bonus.config.questionMs
  game.version++
}

/** Catch up against the original deadlines, without granting time after a delayed sweep. */
export function advanceBonus(game: GameState, now: number): boolean {
  const bonus = game.bonus!
  const version = game.version
  const deadline = bonus.startedAt! + bonus.config.durationMs
  const active = game.players.filter(player => !player.retired && bonus.participantIds.includes(player.id))
  for (const player of active) {
    const progress = bonus.progress[player.id]
    while (progress.completedMs === null && progress.questionDeadline <= now && progress.questionDeadline < deadline) {
      progress.chain = 0
      progress.questionInstanceId = randomUUID()
      progress.questionDeadline += bonus.config.questionMs
      progress.lastOutcome = 'timeout'
      game.version++
    }
  }
  if (now >= deadline || active.every(player => bonus.progress[player.id].completedMs !== null)) {
    finalizeBonus(game)
    game.phase = 'bonus_results'
    game.opensAt = Math.min(now, deadline)
    game.deadline = null
    game.version++
  }
  return version !== game.version
}

function finalizeBonus(game: GameState): void {
  const bonus = game.bonus!
  if (bonus.results !== null) return
  const rows = bonus.participantIds.map(playerId => {
    const player = game.players.find(player => player.id === playerId)!
    const progress = bonus.progress[playerId]
    return {
      playerId, rank: 0, chain: player.retired ? 0 : progress.chain,
      completedMs: player.retired ? null : progress.completedMs,
      bonusPoints: 0, triviaPoints: player.points, totalPoints: player.points, retired: player.retired,
    }
  }).sort((left, right) => right.chain - left.chain || (left.chain === bonus.config.target ? left.completedMs! - right.completedMs! : 0))
  rows.forEach((row, index) => {
    const previous = rows[index - 1]
    row.rank = previous && previous.chain === row.chain && (row.chain !== bonus.config.target || previous.completedMs === row.completedMs)
      ? previous.rank : index + 1
    row.bonusPoints = row.chain === 0 || row.retired ? 0
      : Math.round(3000 - 2500 * (row.rank - 1) / (bonus.participantIds.length - 1))
    row.totalPoints += row.bonusPoints
    game.players.find(player => player.id === row.playerId)!.points = row.totalPoints
  })
  bonus.results = rows
}

export function bonusSnapshot(game: GameState, selfId: string): BonusSnapshot | null {
  const bonus = game.bonus
  if (!bonus) return null
  const progress = bonus.progress[selfId]
  const playing = game.phase === 'bonus_playing'
  const player = game.players.find(player => player.id === selfId)
  const question = playing && progress && progress.completedMs === null && !player?.retired ? bonus.questions[progress.chain] : null
  return {
    runId: bonus.runId, target: bonus.config.target, questionMs: bonus.config.questionMs,
    participantCount: bonus.participantIds.length, completedCount: bonus.participantIds.filter(id => !game.players.find(player => player.id === id)?.retired && bonus.progress[id]?.completedMs !== null).length,
    startedAt: bonus.startedAt, chain: progress?.chain ?? 0,
    question: question ? { instanceId: progress.questionInstanceId, prompt: question.prompt, options: structuredClone(question.options) } : null,
    questionDeadline: question ? progress.questionDeadline : null, completedMs: progress?.completedMs ?? null,
    lastConsumedInstanceId: progress?.lastConsumedInstanceId ?? null, lastOutcome: progress?.lastOutcome ?? null,
    results: bonus.results ? structuredClone(bonus.results) : null,
  }
}
