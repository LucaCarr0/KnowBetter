import { randomInt } from 'node:crypto'
import { alreadyPlayed, invalidAction, standardResults, type MinigameDefinition } from './types'

interface NumbersState { grid: number[]; finished: Record<string, number> }

function shuffledGrid(): number[] {
  const grid = Array.from({ length: 16 }, (_, index) => index + 1)
  for (let index = grid.length - 1; index > 0; index--) {
    const other = randomInt(index + 1)
    ;[grid[index], grid[other]] = [grid[other], grid[index]]
  }
  return grid
}

/** The phone checks each tap and reports only the finish, to spare a transaction per tap. */
export const numbersGame: MinigameDefinition<NumbersState> = {
  kind: 'numbers', minPlayers: 2, durationMs: 20_000,
  create: () => ({ grid: shuffledGrid(), finished: {} }),
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
