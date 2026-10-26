import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { GameSnapshot } from '../features/game/types'
import type { RoomAction, RoomResponse, RoomSnapshot } from '../features/rooms/types'
import { createDatabase } from './database'
import type { GameContent, TriviaQuestion } from './game/engine'
import { LobbyService, type Connection } from './lobby'

const gameConfig = { countdownMs: 50, introMs: 100, voteMs: 120, categoryRevealMs: 30, questionMs: 200, roundRevealMs: 50, scoreboardMs: 50, suspensionMs: 900 }
const identity = (nickname: string) => ({ nickname, avatarId: 'panda' as const })

function catalog(): GameContent {
  const categories = ['animals', 'art', 'history'].map(id => ({ id, name: id }))
  return {
    categories,
    questions: categories.flatMap(category => Array.from({ length: 8 }, (_, index): TriviaQuestion => ({
      id: `${category.id}-${index}`, categoryId: category.id, prompt: `Question ${category.id} ${index}`,
      options: ['a', 'b', 'c', 'd'].map(id => ({ id, text: `Option ${id}` })), correctOptionId: 'a',
      difficulty: 'easy', language: 'it', sourceName: 'Integration fixtures', sourceUrl: 'https://example.test/trivia', license: 'CC0', sourceId: `${index}`,
    }))),
  }
}

function room(response: RoomResponse): RoomSnapshot {
  assert.equal(response.ok, true, JSON.stringify(response))
  assert.ok(response.ok && response.room)
  return response.room
}

function game(response: RoomResponse): GameSnapshot {
  const state = room(response).game
  assert.ok(state, JSON.stringify(response))
  return state
}

function errorCode(response: RoomResponse): string {
  assert.equal(response.ok, false, JSON.stringify(response))
  assert.ok(!response.ok)
  return response.error.code
}

test('phase-one commands, snapshots and JSONB persistence share the lobby transaction discipline', async t => {
  const database = await createDatabase({ dataDir: 'memory://' })
  const gameContent = catalog()
  let now = 1_000_000
  let service = new LobbyService(database, { now: () => now, gameContent, gameConfig })
  await service.initialize()

  const player = async (): Promise<Connection> => {
    now++
    const guest = await service.guest()
    const connection = { guestId: guest.guestId, socketId: randomUUID() }
    assert.equal(await service.connect(connection), true)
    return connection
  }
  const command = (connection: Connection, action: RoomAction, fields: Record<string, unknown> = {}, receivedAt = now) => service.command(connection, action, { requestId: randomUUID(), ...fields }, receivedAt)
  const state = async (connection: Connection) => room(await command(connection, 'room:resume'))
  const currentGame = async (connection: Connection) => game(await command(connection, 'room:resume'))
  const party = async () => {
    const host = await player()
    const created = room(await command(host, 'room:create', { identity: identity('Host') }))
    const guest = await player()
    const joined = room(await command(guest, 'room:join', { code: created.code, identity: identity('Guest') }))
    return { host, guest, created, joined }
  }
  const tick = async (connection: Connection) => {
    const before = await currentGame(connection)
    assert.notEqual(before.deadline, null)
    now = before.deadline!
    await service.sweep()
    return currentGame(connection)
  }
  const start = async (host: Connection, roomId: string) => {
    assert.equal(game(await command(host, 'game:start', { roomId })).phase, 'countdown')
    assert.equal((await tick(host)).phase, 'intro')
    assert.equal((await tick(host)).phase, 'category_vote')
    return currentGame(host)
  }
  const voteBoth = async (host: Connection, guest: Connection, categoryId = 'animals') => {
    const voting = await currentGame(host)
    assert.equal(voting.phase, 'category_vote')
    const fields = { matchId: voting.id, roundId: voting.round, categoryId }
    assert.equal(game(await command(host, 'game:vote-category', fields)).phase, 'category_vote')
    assert.equal(game(await command(guest, 'game:vote-category', fields)).phase, 'category_reveal')
    assert.equal((await tick(host)).phase, 'question')
    return currentGame(host)
  }

  try {
    await t.test('only the host can start, at least two connected players are required, and identity freezes', async () => {
      const host = await player()
      const created = room(await command(host, 'room:create', { identity: identity('Solo host') }))
      assert.equal(errorCode(await command(host, 'game:start', { roomId: created.id })), 'NOT_ENOUGH_PLAYERS')
      const guest = await player()
      room(await command(guest, 'room:join', { code: created.code, identity: identity('Guest') }))
      assert.equal(errorCode(await command(guest, 'game:start', { roomId: created.id })), 'HOST_REQUIRED')
      assert.equal(errorCode(await command(host, 'game:start', { roomId: 'wrong-room' })), 'STALE_ROOM')
      game(await command(host, 'game:start', { roomId: created.id }))
      assert.equal(errorCode(await command(host, 'room:update', { identity: identity('Changed') })), 'GAME_STARTED')
    })

    await t.test('racing starts and a simultaneous join create exactly one match and one fixed roster', async () => {
      const { host, guest, created } = await party()
      const newcomer = await player()
      const results = await Promise.all([
        command(host, 'game:start', { roomId: created.id }),
        command(host, 'game:start', { roomId: created.id }),
        command(newcomer, 'room:join', { code: created.code, identity: identity('Late guest') }),
      ])
      assert.equal(results.filter(result => result.ok).length, 1)
      assert.deepEqual(results.filter(result => !result.ok).map(errorCode), ['GAME_STARTED', 'GAME_STARTED'])
      const first = await currentGame(host)
      const second = await currentGame(guest)
      assert.equal(first.id, second.id)
      assert.equal(first.players.length, 2)
      const matches = await database.transaction(db => db.query('SELECT count(*)::integer AS count FROM kb_matches WHERE room_id=$1', [created.id]))
      assert.equal(matches.rows[0].count, 1)
    })

    await t.test('a countdown disconnect returns the room to waiting without points or a live match', async () => {
      const { host, guest, created } = await party()
      game(await command(host, 'game:start', { roomId: created.id }))
      await service.disconnect(guest)
      const waiting = await state(host)
      assert.equal(waiting.status, 'waiting')
      assert.equal(waiting.game, null)
      const matches = await database.transaction(db => db.query('SELECT active,state FROM kb_matches WHERE room_id=$1', [created.id]))
      assert.equal(matches.rows[0].active, false)
      const saved = matches.rows[0].state as { phase: string; players: { points: number }[] }
      assert.equal(saved.phase, 'aborted')
      assert.deepEqual(saved.players.map(player => player.points), [0, 0])
      // Cancellation must be committed in disconnect itself; a quick reconnect
      // before the periodic sweep must not silently revive the old countdown.
      const returning = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returning), true)
      assert.equal((await state(returning)).game, null)

      const second = await party()
      game(await command(second.host, 'game:start', { roomId: second.created.id }))
      assert.deepEqual(await command(second.guest, 'room:leave'), { ok: true, room: null })
      const afterLeave = await state(second.host)
      assert.equal(afterLeave.status, 'waiting')
      assert.equal(afterLeave.game, null)
      assert.equal(afterLeave.members.length, 1)
    })

    await t.test('five rounds synchronize rankings, hide answers, and recognize durable command replays', async () => {
      const { host, guest, created, joined } = await party()
      await start(host, created.id)
      const used = new Set<string>()
      for (let round = 1; round <= 5; round++) {
        const question = await voteBoth(host, guest)
        assert.equal(question.round, round)
        assert.equal(question.reveal, null)
        assert.ok(question.question)
        assert.equal(used.has(question.question.id), false)
        used.add(question.question.id)
        assert.equal(JSON.stringify(question).includes('correctOptionId'), false)
        const answerPayload = { requestId: randomUUID(), matchId: question.id, roundId: round, questionInstanceId: question.question.instanceId, optionId: 'a' }
        const accepted = game(await service.command(host, 'game:answer', answerPayload))
        assert.equal(accepted.selfAnswer, 'a')
        assert.equal(accepted.reveal, null)
        assert.equal(accepted.players.find(player => player.id === created.selfId)!.points, (round - 1) * 1000)
        const other = await currentGame(guest)
        assert.equal(other.selfAnswer, null)
        assert.equal(other.answeredCount, 1)
        const replay = game(await service.command(host, 'game:answer', answerPayload))
        assert.equal(replay.answeredCount, 1)
        assert.equal(errorCode(await service.command(host, 'game:answer', { ...answerPayload, optionId: 'b' })), 'REQUEST_REUSED')
        assert.equal(errorCode(await command(host, 'game:answer', { ...answerPayload, requestId: randomUUID() })), 'ALREADY_ANSWERED')
        now += 20
        const result = game(await command(guest, 'game:answer', { matchId: question.id, roundId: round, questionInstanceId: question.question.instanceId, optionId: 'a' }))
        assert.equal(result.phase, 'round_reveal')
        assert.equal(result.reveal!.correctOptionId, 'a')
        assert.equal(result.players.find(player => player.id === created.selfId)!.points, round * 1000)
        assert.equal(result.players.find(player => player.id === joined.selfId)!.points, round * 950)
        assert.deepEqual((await currentGame(host)).players, (await currentGame(guest)).players)
        const completedReplay = game(await service.command(host, 'game:answer', answerPayload))
        assert.equal(completedReplay.phase, 'round_reveal')
        assert.equal(completedReplay.players.find(player => player.id === created.selfId)!.points, round * 1000)
        assert.equal((await tick(host)).phase, 'scoreboard')
        assert.equal((await tick(host)).phase, round === 5 ? 'phase_complete' : 'category_vote')
      }
      const completed = await currentGame(host)
      assert.equal(completed.round, 5)
      assert.equal(completed.deadline, null)
      assert.equal(used.size, 5)
      assert.equal(errorCode(await command(guest, 'game:return-lobby', { matchId: completed.id })), 'HOST_REQUIRED')
      const returned = room(await command(host, 'game:return-lobby', { matchId: completed.id }))
      assert.equal(returned.status, 'waiting')
      assert.equal(returned.game, null)
      assert.equal(returned.members.length, 2)
      const oldMatch = await database.transaction(db => db.query<{ active: boolean; state: { players: { points: number }[] } }>('SELECT active,state FROM kb_matches WHERE id=$1', [completed.id]))
      assert.equal(oldMatch.rows[0].active, false)
      assert.equal(oldMatch.rows[0].state.players.find(player => player.points === 5000)?.points, 5000)
    })

    await t.test('stale match, round, instance and exact deadline cannot submit or mutate points', async () => {
      const { host, guest, created } = await party()
      await start(host, created.id)
      const question = await voteBoth(host, guest)
      const fields = { matchId: question.id, roundId: question.round, questionInstanceId: question.question!.instanceId, optionId: 'a' }
      assert.equal(errorCode(await command(host, 'game:answer', { ...fields, matchId: 'old-match' })), 'STALE_GAME')
      assert.equal(errorCode(await command(host, 'game:answer', { ...fields, roundId: 0 })), 'STALE_ROUND')
      assert.equal(errorCode(await command(host, 'game:answer', { ...fields, questionInstanceId: 'old-instance' })), 'STALE_QUESTION')
      assert.equal(errorCode(await command(host, 'game:answer', { ...fields, optionId: 'invalid' })), 'INVALID_OPTION')
      now = question.deadline!
      assert.equal(errorCode(await command(host, 'game:answer', fields)), 'ACTION_TOO_LATE')
      const beforeSweep = await currentGame(host)
      assert.equal(beforeSweep.answeredCount, 0)
      assert.ok(beforeSweep.players.every(player => player.points === 0))
      await service.sweep()
      const revealed = await currentGame(host)
      assert.equal(revealed.phase, 'round_reveal')
      assert.ok(revealed.players.every(player => player.points === 0))
      assert.equal(errorCode(await command(host, 'game:return-lobby', { matchId: question.id })), 'GAME_NOT_FINISHED')
    })

    await t.test('offline game membership survives the lobby reservation window and resumes the same player', async () => {
      const { host, guest, created, joined } = await party()
      await start(host, created.id)
      const question = await voteBoth(host, guest)
      await service.disconnect(guest)
      now += 90_001
      await service.sweep()
      const offline = await state(host)
      assert.equal(offline.members.length, 2)
      assert.equal(offline.game!.players.length, 2)
      assert.equal(offline.game!.players.find(player => player.id === joined.selfId)!.connected, false)
      const returning = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returning), true)
      const resumed = await state(returning)
      assert.equal(resumed.selfId, joined.selfId)
      assert.equal(resumed.game!.id, question.id)
      assert.equal(resumed.game!.players.find(player => player.id === joined.selfId)!.connected, true)
    })

    await t.test('all players explicitly leaving archives the match so the scheduler cannot reopen the empty room', async () => {
      const { host, guest, created } = await party()
      await start(host, created.id)
      const question = await voteBoth(host, guest)
      assert.deepEqual(await command(host, 'room:leave'), { ok: true, room: null })
      assert.deepEqual(await command(guest, 'room:leave'), { ok: true, room: null })
      now = question.deadline! + gameConfig.roundRevealMs + gameConfig.scoreboardMs + 1
      await service.sweep()
      const saved = await database.transaction(db => db.query<{ status: string; active: boolean }>('SELECT r.status,m.active FROM kb_rooms r JOIN kb_matches m ON m.room_id=r.id WHERE r.id=$1', [created.id]))
      assert.equal(saved.rows[0].status, 'closed')
      assert.equal(saved.rows[0].active, false)
      assert.equal((await service.snapshots([host.guestId])).get(host.guestId), null)
    })

    await t.test('server recovery voids the exposed instance and an old acknowledged answer cannot affect its replacement', async () => {
      const { host, guest, created, joined } = await party()
      await start(host, created.id)
      const original = await voteBoth(host, guest)
      const oldRequest = { requestId: randomUUID(), matchId: original.id, roundId: original.round, questionInstanceId: original.question!.instanceId, optionId: 'a' }
      game(await service.command(host, 'game:answer', oldRequest))
      await service.drain()
      service = new LobbyService(database, { now: () => now, gameContent, gameConfig })
      await service.initialize()
      const returningHost = { guestId: host.guestId, socketId: randomUUID() }
      const returningGuest = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returningHost), true)
      assert.equal((await currentGame(returningHost)).phase, 'suspended')
      assert.equal(await service.connect(returningGuest), true)
      const returned = await state(returningGuest)
      assert.equal(returned.selfId, joined.selfId)
      await service.sweep()
      assert.equal((await currentGame(returningHost)).phase, 'category_reveal')
      const replacement = await tick(returningHost)
      assert.equal(replacement.phase, 'question')
      assert.notEqual(replacement.question!.instanceId, original.question!.instanceId)
      assert.notEqual(replacement.question!.id, original.question!.id)
      assert.equal(replacement.round, original.round)
      const replay = game(await service.command(returningHost, 'game:answer', oldRequest))
      assert.equal(replay.question!.instanceId, replacement.question!.instanceId)
      assert.equal(replay.selfAnswer, null)
      assert.equal(replay.answeredCount, 0)
      assert.ok(replay.players.every(player => player.points === 0))
      assert.equal(errorCode(await command(returningHost, 'game:answer', { ...oldRequest, requestId: randomUUID() })), 'STALE_QUESTION')
      const currentFields = { matchId: replacement.id, roundId: replacement.round, questionInstanceId: replacement.question!.instanceId, optionId: 'a' }
      game(await command(returningHost, 'game:answer', currentFields))
      now += 20
      const revealed = game(await command(returningGuest, 'game:answer', currentFields))
      assert.equal(revealed.players.find(player => player.id === created.selfId)!.points, 1000)
      assert.equal(revealed.players.find(player => player.id === joined.selfId)!.points, 950)
      const saved = await database.transaction(db => db.query<{ state: { rounds: { questionInstances: { status: string }[] }[] } }>('SELECT state FROM kb_matches WHERE id=$1', [original.id]))
      assert.deepEqual(saved.rows[0].state.rounds[0].questionInstances.map(instance => instance.status), ['voided', 'revealed'])
    })
  } finally {
    await service.drain()
    await database.close()
  }
})
