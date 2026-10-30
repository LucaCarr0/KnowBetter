import { randomInt } from 'node:crypto'
import type { MinigameResult } from '../../../features/game/wheel'
import { GameRuleError } from '../errors'
import { TEXTS } from '../../../texts'
import { invalidAction, type MinigameContext, type MinigameDefinition } from './types'

interface BombState {
  holderId: string
  /** Chi ha appena passato la bomba: non può riceverla subito indietro. */
  blockedId: string | null
  /** Private until they go off. */
  blastOffsets: number[]
  blastsDone: number
  lastBlastId: string | null
  hits: Record<string, number>
}

const POINTS_PER_HIT = 300
const SURVIVOR_PRIZE = 300
const WINDOWS = [[5_000, 9_000], [12_000, 16_000], [19_000, 24_000]]

const choose = <T>(items: T[]): T => items[randomInt(items.length)]

function holderCandidates(state: BombState, context: MinigameContext): string[] {
  const connected = context.activeIds.filter(id => context.connectedIds.has(id))
  return connected.length ? connected : context.activeIds
}

export const bombGame: MinigameDefinition<BombState> = {
  kind: 'bomb', minPlayers: 3, durationMs: 25_000,
  create: participantIds => ({
    holderId: choose(participantIds), blockedId: null, blastsDone: 0, lastBlastId: null, hits: {},
    blastOffsets: WINDOWS.map(([from, to]) => from + randomInt(to - from + 1)),
  }),
  act(state, context, playerId, action) {
    if (action.type !== 'pass' || typeof action.targetId !== 'string') throw invalidAction()
    if (state.holderId !== playerId) throw new GameRuleError('BOMB_NOT_HELD', TEXTS.errors.bombNotHeld)
    const others = context.activeIds.filter(id => id !== playerId && context.connectedIds.has(id))
    // With a single reachable opponent the block would freeze the bomb.
    const allowed = others.length > 1 ? others.filter(id => id !== state.blockedId) : others
    if (!allowed.includes(action.targetId)) throw new GameRuleError('BOMB_INVALID_TARGET', TEXTS.errors.bombInvalidTarget)
    state.blockedId = playerId
    state.holderId = action.targetId
  },
  advance(state, context, now) {
    let changed = false
    // Catch up on the original times if the sweep runs late.
    while (state.blastsDone < state.blastOffsets.length && now >= context.startedAt + state.blastOffsets[state.blastsDone]) {
      if (context.activeIds.includes(state.holderId)) {
        state.hits[state.holderId] = (state.hits[state.holderId] ?? 0) + 1
        state.lastBlastId = state.holderId
      }
      state.blastsDone++
      state.blockedId = null
      state.holderId = choose(holderCandidates(state, context))
      changed = true
    }
    if (state.blastsDone < state.blastOffsets.length && (!context.activeIds.includes(state.holderId) || !context.connectedIds.has(state.holderId))) {
      const candidates = holderCandidates(state, context).filter(id => id !== state.holderId)
      if (candidates.length) {
        state.holderId = choose(candidates)
        state.blockedId = null
        changed = true
      }
    }
    return changed
  },
  isComplete: state => state.blastsDone >= state.blastOffsets.length,
  results(state, participantIds, retiredIds) {
    const hitsOf = (playerId: string) => state.hits[playerId] ?? 0
    const pointsOf = (playerId: string) => retiredIds.has(playerId) ? 0 : hitsOf(playerId) ? -POINTS_PER_HIT * hitsOf(playerId) : SURVIVOR_PRIZE
    const sorted = [...participantIds].sort((left, right) => hitsOf(left) - hitsOf(right))
    const rows: MinigameResult[] = []
    sorted.forEach((playerId, index) => {
      const rank = index > 0 && hitsOf(sorted[index - 1]) === hitsOf(playerId) ? rows[index - 1].rank : index + 1
      rows.push({ playerId, rank, points: pointsOf(playerId), detail: hitsOf(playerId) })
    })
    return rows
  },
  view: (state, selfId) => ({ kind: 'bomb', holderId: state.holderId, blockedId: state.blockedId, blastsDone: state.blastsDone, totalBlasts: state.blastOffsets.length, lastBlastId: state.lastBlastId, selfHits: state.hits[selfId] ?? 0 }),
  revealValue: () => null,
}
