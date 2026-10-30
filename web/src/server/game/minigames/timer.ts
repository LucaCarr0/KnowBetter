import { randomInt } from 'node:crypto'
import { alreadyPlayed, invalidAction, standardResults, type MinigameDefinition } from './types'

interface TimerState { targetMs: number; hideAfterMs: number; elapsed: Record<string, number> }

const DURATION_MS = 20_000
const CLOCK_TOLERANCE_MS = 1_000

/** The phone measures the time, so latency does not penalize remote players. */
export const timerGame: MinigameDefinition<TimerState> = {
  kind: 'timer', minPlayers: 2, durationMs: DURATION_MS,
  create: () => ({ targetMs: 5_000 + randomInt(51) * 100, hideAfterMs: 2_000, elapsed: {} }),
  act(state, context, playerId, action, now) {
    if (action.type !== 'stop' || typeof action.elapsedMs !== 'number' || !Number.isFinite(action.elapsedMs) || action.elapsedMs <= 0) throw invalidAction()
    if (Object.hasOwn(state.elapsed, playerId)) throw alreadyPlayed()
    if (action.elapsedMs > now - context.startedAt + CLOCK_TOLERANCE_MS) throw invalidAction()
    state.elapsed[playerId] = Math.round(action.elapsedMs)
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => Object.hasOwn(state.elapsed, id)),
  results(state, participantIds, retiredIds) {
    return standardResults(participantIds.map(playerId => {
      const elapsed = retiredIds.has(playerId) ? undefined : state.elapsed[playerId]
      const gap = elapsed === undefined ? null : Math.abs(elapsed - state.targetMs)
      return { playerId, value: gap, detail: gap }
    }), participantIds.length)
  },
  view: (state, selfId) => ({ kind: 'timer', targetMs: state.targetMs, hideAfterMs: state.hideAfterMs, selfElapsedMs: state.elapsed[selfId] ?? null, stoppedCount: Object.keys(state.elapsed).length }),
  revealValue: state => state.targetMs,
}
