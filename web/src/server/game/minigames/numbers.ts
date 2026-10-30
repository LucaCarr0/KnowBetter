import { alreadyPlayed, invalidAction, shuffled, standardResults, type MinigameDefinition } from './types'

interface NumbersState { grid: number[]; finished: Record<string, number> }

/** The phone checks each tap and reports only the finish, to spare a transaction per tap. */
export const numbersGame: MinigameDefinition<NumbersState> = {
  kind: 'numbers', minPlayers: 2, durationMs: 20_000,
  create: () => ({ grid: shuffled(Array.from({ length: 16 }, (_, index) => index + 1)), finished: {} }),
  act(state, context, playerId, action, now) {
    if (action.type !== 'finish') throw invalidAction()
    if (Object.hasOwn(state.finished, playerId)) throw alreadyPlayed()
    state.finished[playerId] = now - context.startedAt
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => Object.hasOwn(state.finished, id)),
  results(state, participantIds, retiredIds) {
    return standardResults(participantIds.map(playerId => {
      const time = retiredIds.has(playerId) ? null : state.finished[playerId] ?? null
      return { playerId, value: time, detail: time }
    }), participantIds.length)
  },
  view: (state, selfId) => ({ kind: 'numbers', grid: [...state.grid], selfFinishedMs: state.finished[selfId] ?? null, finishedCount: Object.keys(state.finished).length }),
  revealValue: () => null,
}
