import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { GameSnapshot } from '../features/game/types'
import type { RoomAction, RoomResponse, RoomSnapshot } from '../features/rooms/types'
import { getBonusCatalog } from './content/bonus-catalog'
import { createDatabase } from './database'
import type { GameContent, GameState } from './game/engine'
import { LobbyService, type Connection } from './lobby'

const catalog: GameContent = {
  categories: ['arte', 'storia', 'scienze'].map(id => ({ id, name: id })),
  questions: ['arte', 'storia', 'scienze'].flatMap(categoryId => Array.from({ length: 5 }, (_, index) => ({
    id: `${categoryId}-${index}`, categoryId, prompt: `Domanda ${categoryId} ${index}`,
    options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Risposta ${id}` })), correctOptionId: 'a',
    difficulty: 'easy', language: 'it', sourceName: 'Fixture', sourceUrl: 'https://example.test', license: 'CC0', sourceId: `${index}`,
  }))),
  bonusQuestions: getBonusCatalog().questions,
}

function room(response: RoomResponse): RoomSnapshot {
  assert.ok(response.ok && response.room, JSON.stringify(response))
  return response.room
}

function game(response: RoomResponse): GameSnapshot {
  const state = room(response).game
  assert.ok(state)
  return state
}

function error(response: RoomResponse): string {
  assert.equal(response.ok, false, JSON.stringify(response))
  assert.ok(!response.ok)
  return response.error.code
}

test('ten-client bonus commands share one durable queue through retries, timeouts, reconnection and restarts', async () => {
  const database = await createDatabase({ dataDir: 'memory://' })
  let now = 1_000_000
  let service = new LobbyService(database, { gameContent: catalog, now: () => now })
  await service.initialize()
  const connections: Connection[] = []
  const memberIds: string[] = []
  const command = (connection: Connection, action: RoomAction, fields: Record<string, unknown> = {}) => service.command(connection, action, { requestId: randomUUID(), ...fields }, now)
  let roomId = ''
  let code = ''
  let matchId = ''
  const saved = async () => database.transaction(async db => (await db.query<{ state: GameState }>('SELECT state FROM kb_matches WHERE id=$1', [matchId])).rows[0].state)
  const restart = async () => {
    await service.drain()
    service = new LobbyService(database, { gameContent: catalog, now: () => now })
    await service.initialize()
    for (let index = 0; index < connections.length; index++) {
      connections[index] = { guestId: connections[index].guestId, socketId: randomUUID() }
      assert.equal(await service.connect(connections[index]), true)
      room(await command(connections[index], 'room:resume'))
    }
  }
  const answerFields = (state: GameState, index: number) => {
    const bonus = state.bonus!
    const progress = bonus.progress[memberIds[index]]
    const question = bonus.questions[progress.chain]
    return {
      matchId, roundId: 5, bonusRunId: bonus.runId, questionInstanceId: progress.questionInstanceId,
      optionId: question.options.find(option => option.id !== question.correctOptionId)!.id,
    }
  }

  try {
    for (let index = 0; index < 10; index++) {
      const guest = await service.guest()
      const connection = { guestId: guest.guestId, socketId: randomUUID() }
      connections.push(connection)
      assert.equal(await service.connect(connection), true)
      const joined = room(await command(connection, index === 0 ? 'room:create' : 'room:join', { code, identity: { nickname: `Giocatore ${index + 1}`, avatarId: 'panda' } }))
      roomId = joined.id
      code = joined.code
      memberIds.push(joined.selfId)
    }
    const countdown = game(await command(connections[0], 'game:start', { roomId }))
    matchId = countdown.id
    // The full five-round route is covered by game-integration.test.ts. Start this
    // load/recovery fixture at its already-persisted bonus introduction checkpoint.
    await database.transaction(async db => {
      const state = (await db.query<{ state: GameState }>('SELECT state FROM kb_matches WHERE id=$1', [matchId])).rows[0].state
      state.phase = 'bonus_intro'
      state.round = 5
      state.deadline = null
      state.players.forEach(player => { player.points = 5000 })
      await db.query('UPDATE kb_matches SET state=$1::jsonb WHERE id=$2', [JSON.stringify(state), matchId])
      await db.query("UPDATE kb_rooms SET status='playing' WHERE id=$1", [roomId])
    })
    const startFields = { matchId, roundId: 5, expectedPhase: 'bonus_intro' }
    const playing = game(await command(connections[3], 'game:continue', startFields))
    const originalDeadline = playing.deadline!
    const firstState = await saved()
    const requests = connections.map((_, index) => ({ requestId: randomUUID(), ...answerFields(firstState, index) }))
    const responses = await Promise.all(connections.map((connection, index) => service.command(connection, 'game:bonus-answer', requests[index], now)))
    assert.ok(responses.every(response => game(response).bonus!.chain === 1))
    assert.ok((await saved()).players.every(player => player.points === 5000))
    const first = requests[0]
    const duplicate = game(await service.command(connections[0], 'game:bonus-answer', first, now))
    assert.equal(duplicate.bonus!.chain, 1)
    assert.equal(duplicate.bonus!.lastConsumedInstanceId, first.questionInstanceId)
    assert.equal(error(await command(connections[0], 'game:bonus-answer', { ...first, requestId: randomUUID() })), 'STALE_QUESTION')
    assert.equal(error(await service.command(connections[0], 'game:bonus-answer', { ...first, bonusRunId: 'another-run' }, now)), 'REQUEST_REUSED')
    const currentFields = answerFields(await saved(), 0)
    assert.equal(error(await command(connections[0], 'game:bonus-answer', { ...currentFields, bonusRunId: undefined })), 'INVALID_REQUEST')
    assert.equal(error(await command(connections[0], 'game:bonus-answer', { ...currentFields, questionInstanceId: memberIds[0] })), 'STALE_QUESTION')

    now += 5000
    assert.equal(error(await command(connections[0], 'game:bonus-answer', currentFields)), 'STALE_QUESTION')
    const afterTimeout = await saved()
    await service.sweep()
    assert.ok(Object.values(afterTimeout.bonus!.progress).every(progress => progress.chain === 0 && progress.lastOutcome === 'timeout'))
    for (let index = 0; index < 10; index++) {
      assert.notEqual(afterTimeout.bonus!.progress[memberIds[index]].questionInstanceId, firstState.bonus!.progress[memberIds[index]].questionInstanceId)
      assert.equal(afterTimeout.bonus!.progress[memberIds[index]].lastConsumedInstanceId, requests[index].questionInstanceId)
    }
    await service.disconnect(connections[0])
    now += 100
    connections[0] = { guestId: connections[0].guestId, socketId: randomUUID() }
    assert.equal(await service.connect(connections[0]), true)
    const returned = game(await command(connections[0], 'room:resume'))
    assert.equal(returned.deadline, originalDeadline)
    assert.equal(returned.bonus!.questionDeadline, playing.opensAt + 10_000)
    assert.equal(returned.bonus!.lastConsumedInstanceId, first.questionInstanceId)
    assert.equal(game(await service.command(connections[0], 'game:bonus-answer', first, now)).bonus!.chain, 0)

    const oldRun = afterTimeout.bonus!.runId
    const stale = answerFields(afterTimeout, 0)
    await restart()
    const restarted = game(await command(connections[0], 'room:resume'))
    assert.equal(restarted.phase, 'bonus_intro')
    assert.equal(restarted.deadline, null)
    assert.notEqual(restarted.bonus!.runId, oldRun)
    assert.ok(restarted.players.every(player => player.points === 5000))
    const second = game(await command(connections[7], 'game:continue', startFields))
    assert.equal(second.deadline, now + 60_000)
    assert.notDeepEqual((await saved()).bonus!.questions.map(question => question.id), afterTimeout.bonus!.questions.map(question => question.id))
    assert.equal(error(await command(connections[0], 'game:bonus-answer', stale)), 'STALE_BONUS')

    let lastRequest: Record<string, unknown> = {}
    for (let chain = 0; chain < 21; chain++) {
      const state = await saved()
      const wave = connections.map((connection, index) => {
        const fields = { requestId: randomUUID(), ...answerFields(state, index) }
        if (index === 0) lastRequest = fields
        return service.command(connection, 'game:bonus-answer', fields, now)
      })
      const accepted = await Promise.all(wave)
      assert.ok(accepted.every(response => game(response).bonus!.chain === chain + 1))
    }
    const results = game(await command(connections[0], 'room:resume'))
    assert.equal(results.phase, 'bonus_results')
    assert.equal(results.bonus!.completedCount, 10)
    assert.ok(results.bonus!.results!.every(result => result.rank === 1 && result.completedMs === 0 && result.bonusPoints === 3000 && result.totalPoints === 8000))
    const finalized = JSON.stringify(await saved())
    await restart()
    const restored = game(await service.command(connections[0], 'game:bonus-answer', lastRequest, now))
    assert.equal(restored.phase, 'bonus_results')
    assert.ok(restored.players.every(player => player.points === 8000))
    assert.equal(JSON.stringify(await saved()), finalized)
    const summary = game(await command(connections[1], 'game:continue', { matchId, roundId: 5, expectedPhase: 'bonus_results' }))
    assert.equal(summary.phase, 'phase_complete')
    assert.ok(summary.bonus!.results!.every(result => result.triviaPoints + result.bonusPoints === result.totalPoints))
  } finally {
    await service.drain()
    await database.close()
  }
})
