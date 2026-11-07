import { randomInt } from 'node:crypto'
import { BET_MS, GATE_MS, MIN_BET, OUTRO_MS, RACE_CAP_MS, betPayout, maxStake, type MarbleBet } from '../../../features/game/marble-race'
import { GameRuleError } from '../errors'
import { TEXTS } from '../../../texts'
import { courseFor, raceFor } from './marble-race'
import { alreadyPlayed, invalidAction, rowsByPoints, shuffled, type MinigameDefinition } from './types'

/** Course and race are rebuilt from the seed, so the JSONB stays small. */
interface BetState {
  seed: number
  /** Participants in joining order, as the phones list them. */
  marbleIds: string[]
  /** Start positions: private until the bets close, so nobody bets on a lane. */
  slots: string[]
  bets: Record<string, MarbleBet>
  /** Who chose explicitly not to bet. */
  passed: string[]
  /** Offset from the start; null while bets are open. */
  closedMs: number | null
  done: boolean
}

const raceOf = (state: BetState) => raceFor(state.seed, state.slots.length)

export const betGame: MinigameDefinition<BetState> = {
  kind: 'bet', minPlayers: 2, durationMs: BET_MS + GATE_MS + RACE_CAP_MS + OUTRO_MS,
  create: participantIds => ({ seed: randomInt(2 ** 32), marbleIds: [...participantIds], slots: shuffled(participantIds), bets: {}, passed: [], closedMs: null, done: false }),
  act(state, context, playerId, action, now) {
    if (state.closedMs !== null || now - context.startedAt >= BET_MS) throw new GameRuleError('ACTION_TOO_LATE', TEXTS.errors.tooLate)
    if (Object.hasOwn(state.bets, playerId) || state.passed.includes(playerId)) throw alreadyPlayed()
    if (action.type === 'pass') { state.passed.push(playerId); return }
    const { marbleId, amount } = action
    if (action.type !== 'bet' || typeof marbleId !== 'string' || !state.marbleIds.includes(marbleId)
      || !Number.isSafeInteger(amount) || (amount as number) < MIN_BET || (amount as number) > maxStake(context.points[playerId] ?? 0)) throw invalidAction()
    state.bets[playerId] = { marbleId, amount: amount as number }
  },
  advance(state, context, now) {
    const elapsed = now - context.startedAt
    let changed = false
    if (state.closedMs === null) {
      const decided = (id: string) => Object.hasOwn(state.bets, id) || state.passed.includes(id)
      const waiting = context.activeIds.some(id => context.connectedIds.has(id) && !decided(id))
      if (elapsed >= BET_MS || (!waiting && context.activeIds.some(decided))) {
        // The race is run only now: while bets are open its outcome does not exist.
        raceOf(state)
        state.closedMs = Math.min(elapsed, BET_MS)
        changed = true
      }
    }
    if (state.closedMs !== null && !state.done && elapsed >= state.closedMs + GATE_MS + raceOf(state).durationMs + OUTRO_MS) {
      state.done = true
      changed = true
    }
    return changed
  },
  isComplete: state => state.done,
  results(state, participantIds, retiredIds) {
    const order = raceOf(state).order.map(slot => state.slots[slot])
    return rowsByPoints(participantIds.map(playerId => {
      const bet = retiredIds.has(playerId) ? undefined : state.bets[playerId]
      if (!bet) return { playerId, points: 0, detail: null }
      const position = order.indexOf(bet.marbleId) + 1
      return { playerId, points: betPayout(bet.amount, position, order.length), detail: position }
    }))
  },
  view(state, selfId) {
    const run = state.closedMs === null ? null : raceOf(state)
    return {
      kind: 'bet', course: courseFor(state.seed, state.slots.length), marbleIds: state.marbleIds,
      betsCloseOffsetMs: state.closedMs ?? BET_MS, betCount: Object.keys(state.bets).length + state.passed.length, selfBet: state.bets[selfId] ?? null, selfPassed: state.passed.includes(selfId),
      race: run && {
        slots: state.slots, startOffsetMs: state.closedMs! + GATE_MS, durationMs: run.durationMs, track: run.track, finishMs: run.finishMs,
        order: run.order.map(slot => state.slots[slot]), bets: state.bets,
      },
    }
  },
  revealValue: () => null,
}
