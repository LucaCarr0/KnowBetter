import type { MinigameResult } from '../../../features/game/wheel'
import { alreadyPlayed, invalidAction, type MinigameDefinition } from './types'

interface ChestsState { chests: number[]; picks: Record<string, number> }

export const chestsGame: MinigameDefinition<ChestsState> = {
  kind: 'chests', minPlayers: 3, durationMs: 12_000,
  create: () => ({ chests: [1500, 800, 300], picks: {} }),
  act(state, _context, playerId, action) {
    if (action.type !== 'pick' || !Number.isSafeInteger(action.value) || (action.value as number) < 0 || (action.value as number) >= state.chests.length) throw invalidAction()
    if (Object.hasOwn(state.picks, playerId)) throw alreadyPlayed()
    state.picks[playerId] = action.value as number
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => Object.hasOwn(state.picks, id)),
  results(state, participantIds, retiredIds) {
    const pickOf = (playerId: string) => retiredIds.has(playerId) ? undefined : state.picks[playerId]
    const score = (playerId: string) => {
      const pick = pickOf(playerId)
      if (pick === undefined) return 0
      return Math.floor(state.chests[pick] / participantIds.filter(id => pickOf(id) === pick).length)
    }
    const sorted = [...participantIds].sort((left, right) => score(right) - score(left))
    const rows: MinigameResult[] = []
    sorted.forEach((playerId, index) => {
      const points = score(playerId)
      const rank = index > 0 && score(sorted[index - 1]) === points ? rows[index - 1].rank : index + 1
      rows.push({ playerId, rank, points, detail: state.chests[pickOf(playerId) ?? -1] ?? null })
    })
    return rows
  },
  view: (state, selfId) => ({ kind: 'chests', chests: [...state.chests], selfPick: state.picks[selfId] ?? null, pickedCount: Object.keys(state.picks).length }),
  revealValue: () => null,
}
