import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confirmsCommand, type PendingCommand } from '../../features/rooms/hooks/use-room-connection'
import type { BonusSnapshot, GameSnapshot } from '../../features/game/types'
import type { RoomSnapshot } from '../../features/rooms/types'

const bonus: BonusSnapshot = {
  runId: 'bonus-run', target: 21, questionMs: 5000, participantCount: 2, completedCount: 0,
  startedAt: 1000, chain: 1, question: { instanceId: 'next-question', prompt: 'Quale numero è pari?', options: [{ id: 'one', text: '2' }, { id: 'two', text: '3' }] },
  questionDeadline: 6200, completedMs: null, lastConsumedInstanceId: 'accepted-question', lastOutcome: 'advanced', results: null,
}
const game: GameSnapshot = {
  id: 'match', phase: 'bonus_playing', round: 5, totalRounds: 5, version: 4, serverNow: 1200,
  opensAt: 1000, deadline: 61000, players: [], candidates: [], category: null,
  categoryVotes: null, categoryVoters: null, selectionReason: null, question: null,
  selfVote: null, selfAnswer: null, answeredCount: 0, votedCount: 0, reveal: null, message: null, commentary: [], bonus,
  powers: { inventory: [], effect: null, used: false, ready: false, readyCount: 0, preparationId: null, targetedIds: [] },
}
const room: RoomSnapshot = {
  id: 'room', code: 'ABC234', status: 'playing', version: 8, hostId: 'self', selfId: 'self',
  expiresAt: '2026-10-28T12:00:00.000Z', members: [], game,
}
const operation: PendingCommand = {
  action: 'game:bonus-answer', fingerprint: 'intent', previousRoomId: room.id, previousVersion: 7,
  command: { requestId: 'answer-request', matchId: game.id, roundId: 5, bonusRunId: bonus.runId, questionInstanceId: 'accepted-question', optionId: 'two' },
}
const withBonus = (changes: Partial<BonusSnapshot>): RoomSnapshot => ({ ...room, game: { ...game, bonus: { ...bonus, ...changes } } })

test('bonus acknowledgement follows the consumed instance after advancing to another question', () => {
  assert.notEqual(bonus.question?.instanceId, operation.command.questionInstanceId)
  assert.equal(confirmsCommand(operation, room), true)
  assert.equal(confirmsCommand(operation, withBonus({
    chain: 0, question: { ...bonus.question!, instanceId: 'question-after-timeout' }, lastOutcome: 'timeout',
  })), true)
})

test('bonus acknowledgement rejects unrelated public updates, runs and instances', () => {
  assert.equal(confirmsCommand(operation, withBonus({ lastConsumedInstanceId: null })), false)
  assert.equal(confirmsCommand(operation, withBonus({ lastConsumedInstanceId: 'other-instance' })), false)
  assert.equal(confirmsCommand(operation, withBonus({ runId: 'replacement-run' })), false)
  assert.equal(confirmsCommand(operation, { ...room, game: { ...game, id: 'other-match' } }), false)
  assert.equal(confirmsCommand(operation, { ...room, id: 'other-room' }), false)
  assert.equal(confirmsCommand(operation, { ...room, game: { ...game, bonus: null } }), false)
  assert.equal(confirmsCommand(operation, null), false)
})

test('ordinary answer acknowledgement still needs the personal answer on the same instance', () => {
  const ordinary: PendingCommand = { ...operation, action: 'game:answer', command: { ...operation.command, questionInstanceId: 'ordinary-question' } }
  const ordinaryRoom: RoomSnapshot = { ...room, game: { ...game, phase: 'question', question: { id: 'question', instanceId: 'ordinary-question', prompt: 'Domanda', options: [], language: 'it' }, selfAnswer: 'two' } }
  assert.equal(confirmsCommand(ordinary, ordinaryRoom), true)
  assert.equal(confirmsCommand(ordinary, { ...ordinaryRoom, game: { ...ordinaryRoom.game!, selfAnswer: null } }), false)
  assert.equal(confirmsCommand(ordinary, { ...ordinaryRoom, game: { ...ordinaryRoom.game!, question: { ...ordinaryRoom.game!.question!, instanceId: 'different-question' } } }), false)
})

test('bonus result swipe acknowledgement requires leaving the requested pause', () => {
  const continuation: PendingCommand = { ...operation, action: 'game:continue', command: { ...operation.command, expectedPhase: 'bonus_results' } }
  assert.equal(confirmsCommand(continuation, { ...room, game: { ...game, phase: 'bonus_results' } }), false)
  assert.equal(confirmsCommand(continuation, { ...room, game: { ...game, phase: 'phase_complete' } }), true)
})
