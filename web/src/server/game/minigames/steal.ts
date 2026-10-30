import { invalidAction, standardResults, type MinigameDefinition } from './types'

interface StealEntry { pot: number; acted: boolean; stealReadyAt: number; shieldReadyAt: number; shieldUntil: number; stunnedUntil: number }
interface StealState { players: Record<string, StealEntry>; lastHit: { thiefId: string; targetId: string; blocked: boolean } | null }

const START_POT = 500
const STEAL_AMOUNT = 100
const STEAL_COOLDOWN_MS = 2_000
const SHIELD_MS = 1_000
const SHIELD_COOLDOWN_MS = 4_000
const STUN_MS = 2_000

export const stealGame: MinigameDefinition<StealState> = {
  kind: 'steal', minPlayers: 3, durationMs: 20_000,
  create: participantIds => ({
    lastHit: null,
    players: Object.fromEntries(participantIds.map(id => [id, { pot: START_POT, acted: false, stealReadyAt: 0, shieldReadyAt: 0, shieldUntil: 0, stunnedUntil: 0 }])),
  }),
  act(state, context, playerId, action, now) {
    const self = state.players[playerId]
    const stealing = action.type === 'steal' && typeof action.targetId === 'string' && action.targetId !== playerId && context.activeIds.includes(action.targetId)
    if (!stealing && action.type !== 'shield') throw invalidAction()
    // A press racing a cooldown is dropped quietly: the phone shows it and an error would only distract.
    if (now < self.stunnedUntil) return
    if (!stealing) {
      if (now < self.shieldReadyAt) return
      self.acted = true
      self.shieldUntil = now + SHIELD_MS
      self.shieldReadyAt = now + SHIELD_COOLDOWN_MS
      return
    }
    if (now < self.stealReadyAt) return
    self.acted = true
    self.stealReadyAt = now + STEAL_COOLDOWN_MS
    const targetId = action.targetId as string
    const target = state.players[targetId]
    const blocked = now < target.shieldUntil
    state.lastHit = { thiefId: playerId, targetId, blocked }
    if (blocked) {
      self.stunnedUntil = now + STUN_MS
      return
    }
    const stolen = Math.min(STEAL_AMOUNT, target.pot)
    target.pot -= stolen
    self.pot += stolen
  },
  advance: () => false,
  isComplete: () => false,
  results(state, participantIds, retiredIds) {
    return standardResults(participantIds.map(playerId => {
      const entry = state.players[playerId]
      return { playerId, value: !retiredIds.has(playerId) && entry?.acted ? -entry.pot : null, detail: entry?.pot ?? null }
    }), participantIds.length)
  },
  view(state, selfId) {
    const self = state.players[selfId]
    return {
      kind: 'steal', pots: Object.fromEntries(Object.entries(state.players).map(([id, entry]) => [id, entry.pot])), lastHit: state.lastHit,
      selfStealReadyAt: self?.stealReadyAt ?? 0, selfShieldReadyAt: self?.shieldReadyAt ?? 0, selfShieldUntil: self?.shieldUntil ?? 0, selfStunnedUntil: self?.stunnedUntil ?? 0,
    }
  },
  revealValue: () => null,
}
