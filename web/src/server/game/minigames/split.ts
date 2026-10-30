import { randomInt } from 'node:crypto'
import { alreadyPlayed, invalidAction, rowsByPoints, shuffled, type MinigameDefinition } from './types'

type SplitChoice = 'split' | 'steal'
interface SplitState { pairs: string[][]; picks: Record<string, SplitChoice> }

const JERRY = 'jerry'
const SHARE = 500
const STOLEN = 1000

export const splitGame: MinigameDefinition<SplitState> = {
  kind: 'split', minPlayers: 2, durationMs: 12_000,
  create(participantIds) {
    const order = shuffled(participantIds)
    const picks: Record<string, SplitChoice> = {}
    if (order.length % 2) {
      order.push(JERRY)
      picks[JERRY] = randomInt(2) ? 'steal' : 'split'
    }
    const pairs: string[][] = []
    while (order.length) pairs.push(order.splice(0, 2))
    return { pairs, picks }
  },
  act(state, _context, playerId, action) {
    if (action.type !== 'pick' || (action.value !== 'split' && action.value !== 'steal')) throw invalidAction()
    if (Object.hasOwn(state.picks, playerId)) throw alreadyPlayed()
    state.picks[playerId] = action.value
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => Object.hasOwn(state.picks, id)),
  results(state, participantIds, retiredIds) {
    const choiceOf = (playerId: string) => retiredIds.has(playerId) ? undefined : state.picks[playerId]
    return rowsByPoints(participantIds.map(playerId => {
      const mine = choiceOf(playerId)
      const opponent = state.pairs.find(pair => pair.includes(playerId))?.find(id => id !== playerId)
      // Whoever did not choose counts as splitting, so the opponent is not punished for it.
      const theirs = (opponent && choiceOf(opponent)) ?? 'split'
      const points = !mine || theirs === 'steal' ? 0 : mine === 'steal' ? STOLEN : SHARE
      return { playerId, points, detail: mine ? Number(mine === 'steal') : null }
    }))
  },
  view(state, selfId) {
    const opponent = state.pairs.find(pair => pair.includes(selfId))?.find(id => id !== selfId)
    return {
      kind: 'split', opponentId: !opponent || opponent === JERRY ? null : opponent, selfPick: state.picks[selfId] ?? null,
      pickedCount: Object.keys(state.picks).filter(id => id !== JERRY).length,
    }
  },
  revealValue: () => null,
}
