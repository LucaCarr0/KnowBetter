import type { MinigameResult } from '../../../features/game/wheel'
import { STANDARD_TOP_PRIZE, alreadyPlayed, invalidAction, type MinigameDefinition } from './types'

interface HighestState { max: number; picks: Record<string, number> }

export const highestGame: MinigameDefinition<HighestState> = {
  kind: 'highest', minPlayers: 3, durationMs: 12_000,
  create: () => ({ max: 20, picks: {} }),
  act(state, _context, playerId, action) {
    if (action.type !== 'pick' || !Number.isSafeInteger(action.value) || (action.value as number) < 1 || (action.value as number) > state.max) throw invalidAction()
    if (Object.hasOwn(state.picks, playerId)) throw alreadyPlayed()
    state.picks[playerId] = action.value as number
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => Object.hasOwn(state.picks, id)),
  results(state, participantIds, retiredIds) {
    const pickOf = (playerId: string) => retiredIds.has(playerId) ? undefined : state.picks[playerId]
    const picks = participantIds.map(pickOf).filter(pick => pick !== undefined)
    const unique = picks.filter(pick => picks.indexOf(pick) === picks.lastIndexOf(pick))
    const winning = unique.length ? Math.max(...unique) : null
    const rows: MinigameResult[] = participantIds.map(playerId => {
      const pick = pickOf(playerId)
      const won = pick !== undefined && pick === winning
      return { playerId, rank: won || winning === null ? 1 : 2, points: won ? STANDARD_TOP_PRIZE : 0, detail: pick ?? null }
    })
    return rows.sort((left, right) => right.points - left.points || (right.detail ?? 0) - (left.detail ?? 0))
  },
  view: (state, selfId) => ({ kind: 'highest', max: state.max, selfPick: state.picks[selfId] ?? null, pickedCount: Object.keys(state.picks).length }),
  revealValue: () => null,
}
