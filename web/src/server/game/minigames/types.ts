import { randomInt } from 'node:crypto'
import type { MinigameKind, MinigameResult, MinigameView } from '../../../features/game/wheel'
import { GameRuleError } from '../errors'
import { TEXTS } from '../../../texts'

export interface MinigameContext {
  /** Participants who have not retired. */
  activeIds: string[]
  connectedIds: Set<string>
  startedAt: number
  /** Board points, for the games that stake them. */
  points: Record<string, number>
}

/** Pure rules over JSON serializable state; timing and prizes stay in the wheel. */
export interface MinigameDefinition<State> {
  kind: MinigameKind
  minPlayers: number
  durationMs: number
  create(participantIds: string[]): State
  act(state: State, context: MinigameContext, playerId: string, action: Record<string, unknown>, now: number): void
  /** Time-driven events; true when something visible changed. */
  advance(state: State, context: MinigameContext, now: number): boolean
  isComplete(state: State, context: MinigameContext): boolean
  /** Final rows for the given participants; points are requested, not yet clamped. */
  results(state: State, participantIds: string[], retiredIds: Set<string>): MinigameResult[]
  view(state: State, selfId: string): MinigameView
  revealValue(state: State): number | null
}

export const STANDARD_TOP_PRIZE = 1000
export const STANDARD_LAST_PRIZE = 200

/** Shared positions skip the next ones, as in the bonus. A null value scores nothing. */
export function standardResults(entries: { playerId: string; value: number | null; detail: number | null }[], participants: number): MinigameResult[] {
  const ranked = entries.filter(entry => entry.value !== null).sort((left, right) => left.value! - right.value!)
  const rows: MinigameResult[] = []
  ranked.forEach((entry, index) => {
    const rank = index > 0 && ranked[index - 1].value === entry.value ? rows[index - 1].rank : index + 1
    const points = participants > 1 ? Math.round(STANDARD_TOP_PRIZE - (STANDARD_TOP_PRIZE - STANDARD_LAST_PRIZE) * (rank - 1) / (participants - 1)) : STANDARD_TOP_PRIZE
    rows.push({ playerId: entry.playerId, rank, points, detail: entry.detail })
  })
  const unranked = entries.filter(entry => entry.value === null)
  return [...rows, ...unranked.map(entry => ({ playerId: entry.playerId, rank: ranked.length + 1, points: 0, detail: entry.detail }))]
}

/** Highest points first; equal points share a position, for games whose prize is not by rank. */
export function rowsByPoints(rows: Omit<MinigameResult, 'rank'>[]): MinigameResult[] {
  const sorted = [...rows].sort((left, right) => right.points - left.points)
  const ranked: MinigameResult[] = []
  sorted.forEach((row, index) => ranked.push({ ...row, rank: index > 0 && sorted[index - 1].points === row.points ? ranked[index - 1].rank : index + 1 }))
  return ranked
}

export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1)
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

const MAX_TAPS_PER_SECOND = 15
const MAX_BATCH = 20

/** Taps arrive in batches; the rate cap keeps a script from outrunning the game. */
export function acceptTaps(entry: { lastBatchAt: number | null }, action: Record<string, unknown>, type: string, startedAt: number, now: number): number {
  if (action.type !== type || !Number.isSafeInteger(action.count) || (action.count as number) < 1 || (action.count as number) > MAX_BATCH) throw invalidAction()
  const since = now - (entry.lastBatchAt ?? startedAt)
  const allowed = Math.ceil(since / 1000 * MAX_TAPS_PER_SECOND) + 2
  entry.lastBatchAt = now
  return Math.min(action.count as number, allowed)
}

export function invalidAction(): GameRuleError {
  return new GameRuleError('INVALID_MINIGAME_ACTION', TEXTS.errors.invalidMinigameAction)
}

export function alreadyPlayed(): GameRuleError {
  return new GameRuleError('MINIGAME_ALREADY_PLAYED', TEXTS.errors.minigameAlreadyPlayed)
}
