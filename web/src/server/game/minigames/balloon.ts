import { randomInt } from 'node:crypto'
import { acceptTaps, alreadyPlayed, standardResults, type MinigameDefinition } from './types'

interface BalloonEntry { pumps: number; status: 'pumping' | 'popped'; lastBatchAt: number | null }
interface BalloonState { limit: number; entries: Record<string, BalloonEntry> }

const entryOf = (state: BalloonState, playerId: string): BalloonEntry => state.entries[playerId] ??= { pumps: 0, status: 'pumping', lastBatchAt: null }

export const balloonGame: MinigameDefinition<BalloonState> = {
  kind: 'balloon', minPlayers: 2, durationMs: 15_000,
  create: () => ({ limit: 10 + randomInt(21), entries: {} }),
  act(state, context, playerId, action, now) {
    const entry = entryOf(state, playerId)
    if (entry.status !== 'pumping') throw alreadyPlayed()
    entry.pumps += acceptTaps(entry, action, 'pump', context.startedAt, now)
    if (entry.pumps > state.limit) entry.status = 'popped'
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => state.entries[id]?.status === 'popped'),
  results(state, participantIds, retiredIds) {
    // Closest to the limit when time runs out ranks first. A popped
    // balloon's value (its pumps, above the limit) ranks behind every intact one, or popping would win.
    return standardResults(participantIds.map(playerId => {
      const entry = state.entries[playerId]
      const played = !retiredIds.has(playerId) && entry && entry.pumps > 0
      return { playerId, value: !played ? null : entry.status === 'popped' ? entry.pumps : state.limit - entry.pumps, detail: entry?.pumps ?? 0 }
    }), participantIds.length)
  },
  view(state, selfId) {
    const entries = Object.values(state.entries)
    const self = state.entries[selfId]
    return {
      kind: 'balloon', pumps: self?.pumps ?? 0, status: self?.status ?? 'pumping',
      poppedCount: entries.filter(entry => entry.status === 'popped').length,
    }
  },
  revealValue: state => state.limit,
}
