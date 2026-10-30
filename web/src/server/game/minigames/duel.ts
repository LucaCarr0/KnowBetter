import { randomInt } from 'node:crypto'
import { alreadyPlayed, invalidAction, rowsByPoints, shuffled, standardResults, type MinigameDefinition } from './types'

/** A shot holds the reaction time; null marks a shot before the signal. */
interface DuelState { signalOffsetMs: number; groups: string[][]; shots: Record<string, number | null> }

const CLOCK_TOLERANCE_MS = 1_000

/** The phone measures the reaction, so latency does not penalize remote players. */
export const duelGame: MinigameDefinition<DuelState> = {
  kind: 'duel', minPlayers: 2, durationMs: 15_000,
  create(participantIds) {
    const order = shuffled(participantIds)
    const groups: string[][] = []
    while (order.length >= 2) groups.push(order.splice(0, 2))
    if (order.length) groups[groups.length - 1].push(order[0])
    return { signalOffsetMs: 3_000 + randomInt(7_001), groups, shots: {} }
  },
  act(state, context, playerId, action, now) {
    if (Object.hasOwn(state.shots, playerId)) throw alreadyPlayed()
    if (action.type === 'early') {
      state.shots[playerId] = null
      return
    }
    const elapsed = now - context.startedAt
    if (action.type !== 'shoot' || typeof action.reactionMs !== 'number' || !Number.isFinite(action.reactionMs) || action.reactionMs < 0
      || elapsed < state.signalOffsetMs - CLOCK_TOLERANCE_MS || action.reactionMs > elapsed - state.signalOffsetMs + CLOCK_TOLERANCE_MS) throw invalidAction()
    state.shots[playerId] = Math.round(action.reactionMs)
  },
  advance: () => false,
  isComplete: (state, context) => context.activeIds.every(id => Object.hasOwn(state.shots, id)),
  results(state, _participantIds, retiredIds) {
    return rowsByPoints(state.groups.flatMap(group => standardResults(group.map(playerId => {
      const reaction = retiredIds.has(playerId) ? null : state.shots[playerId] ?? null
      return { playerId, value: reaction, detail: reaction }
    }), group.length)))
  },
  view: (state, selfId) => ({
    kind: 'duel', signalOffsetMs: state.signalOffsetMs, opponentIds: (state.groups.find(group => group.includes(selfId)) ?? []).filter(id => id !== selfId),
    selfReactionMs: state.shots[selfId] ?? null, selfEarly: state.shots[selfId] === null, shotCount: Object.keys(state.shots).length,
  }),
  revealValue: () => null,
}
