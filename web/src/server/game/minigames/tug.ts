import { acceptTaps, rowsByPoints, shuffled, type MinigameDefinition } from './types'

interface TugEntry { count: number; lastBatchAt: number | null }
interface TugState { teams: string[][]; entries: Record<string, TugEntry> }

const WIN_PRIZE = 1000
const LOSS_PRIZE = 200
const TIE_PRIZE = 600

/** With unequal teams, the smaller one's taps weigh more. */
function teamScore(state: TugState, team: string[]): number {
  const weight = Math.max(...state.teams.map(entry => entry.length)) / team.length
  return Math.round(team.reduce((total, id) => total + (state.entries[id]?.count ?? 0), 0) * weight)
}

export const tugGame: MinigameDefinition<TugState> = {
  kind: 'tug', minPlayers: 2, durationMs: 15_000,
  create(participantIds) {
    const order = shuffled(participantIds)
    const half = Math.ceil(order.length / 2)
    return { teams: [order.slice(0, half), order.slice(half)], entries: {} }
  },
  act(state, context, playerId, action, now) {
    const entry = state.entries[playerId] ??= { count: 0, lastBatchAt: null }
    entry.count += acceptTaps(entry, action, 'tug', context.startedAt, now)
  },
  advance: () => false,
  isComplete: () => false,
  results(state, participantIds, retiredIds) {
    const [first, second] = state.teams.map(team => teamScore(state, team))
    const prizeOf = (team: number) => first === second ? TIE_PRIZE : (first > second) === (team === 0) ? WIN_PRIZE : LOSS_PRIZE
    return rowsByPoints(participantIds.map(playerId => {
      const count = state.entries[playerId]?.count ?? 0
      return { playerId, points: count > 0 && !retiredIds.has(playerId) ? prizeOf(state.teams[0].includes(playerId) ? 0 : 1) : 0, detail: count }
    }))
  },
  view: (state, selfId) => ({
    kind: 'tug', teams: state.teams.map(team => [...team]), scores: state.teams.map(team => teamScore(state, team)),
    selfTeam: state.teams[1].includes(selfId) ? 1 : 0, selfTugs: state.entries[selfId]?.count ?? 0,
  }),
  revealValue: () => null,
}
