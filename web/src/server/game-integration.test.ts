import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { getBonusCatalog } from './content/bonus-catalog'
import type { GameSnapshot } from '../features/game/types'
import type { RoomAction, RoomResponse, RoomSnapshot } from '../features/rooms/types'
import { createDatabase } from './database'
import type { GameContent, GameState, TriviaQuestion } from './game/engine'
import { LobbyService, type Connection } from './lobby'

const gameConfig = { countdownMs: 50, voteMs: 120, categoryRevealMs: 30, questionMs: 200, roundRevealMs: 50, scoreboardMs: 50, suspensionMs: 900 }
const identity = (nickname: string) => ({ nickname, avatarId: 'panda' as const })

function catalog(): GameContent {
  const categories = ['animals', 'art', 'history'].map(id => ({ id, name: id }))
  return {
    categories,
    bonusQuestions: getBonusCatalog().questions,
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
    const intro = await tick(host)
    assert.equal(intro.phase, 'intro')
    assert.equal(game(await command(host, 'game:continue', { matchId: intro.id, roundId: 0, expectedPhase: 'intro' })).phase, 'category_vote')
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
  const savedGame = async (matchId: string) => database.transaction(async db => {
    const saved = await db.query<{ state: GameState }>('SELECT state FROM kb_matches WHERE id=$1', [matchId])
    return saved.rows[0].state
  })
  const setPowerKind = async (matchId: string, playerId: string, kind: 'fog' | 'shuffle') => database.transaction(async db => {
    const saved = await db.query<{ state: GameState }>('SELECT state FROM kb_matches WHERE id=$1', [matchId])
    saved.rows[0].state.powerInventories![playerId][0].kind = kind
    await db.query('UPDATE kb_matches SET state=$1::jsonb WHERE id=$2', [JSON.stringify(saved.rows[0].state), matchId])
  })

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

    await t.test('any player may continue, exact scene fields are required, and racing swipes advance once', async () => {
      const { host, guest, created } = await party()
      game(await command(host, 'game:start', { roomId: created.id }))
      const intro = await tick(host)
      const fields = { matchId: intro.id, roundId: 0, expectedPhase: 'intro' }
      assert.equal(intro.phase, 'intro')
      assert.equal(intro.deadline, null)
      assert.equal(errorCode(await command(guest, 'game:continue', { roundId: 0, expectedPhase: 'intro' })), 'STALE_GAME')
      assert.equal(errorCode(await command(guest, 'game:continue', { matchId: intro.id, expectedPhase: 'intro' })), 'STALE_ROUND')
      assert.equal(errorCode(await command(guest, 'game:continue', { matchId: intro.id, roundId: 0 })), 'INVALID_REQUEST')
      assert.equal(errorCode(await command(guest, 'game:continue', { ...fields, expectedPhase: 'question' })), 'INVALID_REQUEST')
      assert.equal(errorCode(await command(guest, 'game:continue', { ...fields, expectedPhase: 'round_ready' })), 'WRONG_GAME_PHASE')
      now += 100_000
      await service.sweep()
      assert.equal((await currentGame(host)).phase, 'intro')
      await service.disconnect(host)
      assert.equal(errorCode(await command(guest, 'game:continue', fields)), 'NOT_ENOUGH_PLAYERS')
      const returningHost = { guestId: host.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returningHost), true)
      await state(returningHost)
      await service.sweep()
      assert.equal((await currentGame(guest)).phase, 'intro')
      assert.equal(errorCode(await command(host, 'game:continue', fields)), 'CONTROL_REQUIRED')
      const request = { requestId: randomUUID(), ...fields }
      const raced = await Promise.all([
        service.command(guest, 'game:continue', request),
        command(returningHost, 'game:continue', fields),
      ])
      assert.equal(raced.filter(response => response.ok).length, 1)
      assert.equal(errorCode(raced.find(response => !response.ok)!), 'STALE_ROUND')
      const voting = await currentGame(guest)
      assert.equal(voting.phase, 'category_vote')
      assert.equal(voting.round, 1)
      const replay = game(await service.command(guest, 'game:continue', request))
      assert.equal(replay.version, voting.version)
      assert.equal(replay.round, 1)
      assert.equal(errorCode(await service.command(guest, 'game:continue', { ...request, expectedPhase: 'round_ready' })), 'REQUEST_REUSED')
      const saved = await database.transaction(db => db.query<{ state: { rounds: unknown[] } }>('SELECT state FROM kb_matches WHERE id=$1', [intro.id]))
      assert.equal(saved.rows[0].state.rounds.length, 1)
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
        const next = await tick(host)
        assert.equal(next.phase, round === 5 ? 'bonus_intro' : 'round_ready')
        if (round < 5) assert.equal(game(await command(guest, 'game:continue', { matchId: next.id, roundId: round, expectedPhase: 'round_ready' })).phase, 'category_vote')
      }
      const bonusIntro = await currentGame(host)
      assert.equal(bonusIntro.phase, 'bonus_intro')
      assert.equal(bonusIntro.round, 5)
      assert.equal(bonusIntro.deadline, null)
      assert.equal(used.size, 5)
      const playing = game(await command(guest, 'game:continue', { matchId: bonusIntro.id, roundId: 5, expectedPhase: 'bonus_intro' }))
      assert.equal(playing.phase, 'bonus_playing')
      assert.equal(playing.deadline! - playing.opensAt, 60_000)
      const bonusRunId = playing.bonus!.runId
      let lastRequest: Record<string, unknown> = {}
      for (let index = 0; index < 21; index++) {
        const current = await currentGame(host)
        const privateState = await savedGame(current.id)
        const question = privateState.bonus!.questions[index]
        const optionId = question.options.find(option => option.id !== question.correctOptionId)!.id
        const request = { requestId: randomUUID(), matchId: current.id, roundId: 5, bonusRunId, questionInstanceId: current.bonus!.question!.instanceId, optionId }
        const accepted = game(await service.command(host, 'game:bonus-answer', request))
        assert.equal(accepted.bonus!.chain, index + 1)
        assert.equal(accepted.bonus!.lastConsumedInstanceId, request.questionInstanceId)
        assert.equal(accepted.players.find(player => player.id === created.selfId)!.points, 5000)
        const replay = game(await service.command(host, 'game:bonus-answer', request))
        assert.equal(replay.bonus!.chain, index + 1)
        assert.equal(replay.bonus!.lastConsumedInstanceId, request.questionInstanceId)
        assert.equal(errorCode(await service.command(host, 'game:bonus-answer', { ...request, bonusRunId: 'old-run' })), 'REQUEST_REUSED')
        assert.equal(errorCode(await command(host, 'game:bonus-answer', { ...request, requestId: randomUUID() })), index === 20 ? 'BONUS_COMPLETED' : 'STALE_QUESTION')
        assert.equal((await currentGame(guest)).bonus!.chain, 0)
        lastRequest = request
      }
      assert.equal((await currentGame(host)).bonus!.completedMs, 0)
      const results = await tick(host)
      assert.equal(results.phase, 'bonus_results')
      assert.equal(results.deadline, null)
      assert.deepEqual(results.bonus!.results!.map(result => [result.chain, result.bonusPoints]), [[21, 3000], [0, 0]])
      assert.equal(results.players.find(player => player.id === created.selfId)!.points, 8000)
      assert.equal(game(await service.command(host, 'game:bonus-answer', lastRequest)).players.find(player => player.id === created.selfId)!.points, 8000)
      const saved = await savedGame(results.id)
      assert.equal(saved.rounds.length, 5)
      assert.deepEqual(saved.bonus!.results, results.bonus!.results)
      const completed = game(await command(guest, 'game:continue', { matchId: results.id, roundId: 5, expectedPhase: 'bonus_results' }))
      assert.equal(completed.phase, 'phase_complete')
      assert.equal(completed.round, 5)
      assert.equal(completed.deadline, null)
      const winner = completed.bonus!.results!.find(result => result.playerId === created.selfId)!
      assert.deepEqual([winner.triviaPoints, winner.bonusPoints, winner.totalPoints], [5000, 3000, 8000])
      assert.equal(errorCode(await command(guest, 'game:return-lobby', { matchId: completed.id })), 'HOST_REQUIRED')
      const returned = room(await command(host, 'game:return-lobby', { matchId: completed.id }))
      assert.equal(returned.status, 'waiting')
      assert.equal(returned.game, null)
      assert.equal(returned.members.length, 2)
      const oldMatch = await database.transaction(db => db.query<{ active: boolean; state: { players: { points: number }[] } }>('SELECT active,state FROM kb_matches WHERE id=$1', [completed.id]))
      assert.equal(oldMatch.rows[0].active, false)
      assert.equal(oldMatch.rows[0].state.players.find(player => player.points === 8000)?.points, 8000)
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

    await t.test('power preparation consumes owned cards once, protects targets and keeps rival inventories private', async () => {
      const { host, guest, created, joined } = await party()
      const third = await player()
      const thirdRoom = room(await command(third, 'room:join', { code: created.code, identity: identity('Third') }))
      const voting = await start(host, created.id)
      const voteFields = { matchId: voting.id, roundId: voting.round, categoryId: 'animals' }
      for (const connection of [host, guest, third]) game(await command(connection, 'game:vote-category', voteFields))
      const preparation = await currentGame(host)
      const guestPreparation = await currentGame(guest)
      const thirdPreparation = await currentGame(third)
      assert.equal(preparation.phase, 'category_reveal')
      assert.ok(preparation.powers.preparationId)
      assert.equal(preparation.question, null)
      for (const personal of [preparation, guestPreparation, thirdPreparation]) {
        assert.equal(personal.powers.inventory.length, 1)
        assert.equal(personal.powers.readyCount, 0)
        assert.equal(personal.powers.preparationId, preparation.powers.preparationId)
        assert.equal(JSON.stringify(personal).includes('powerInventories'), false)
        assert.ok(personal.players.every(player => !Object.hasOwn(player, 'inventory')))
      }
      assert.equal(JSON.stringify(preparation).includes(guestPreparation.powers.inventory[0].id), false)
      assert.equal(JSON.stringify(guestPreparation).includes(preparation.powers.inventory[0].id), false)
      const fields = { matchId: preparation.id, roundId: preparation.round, questionInstanceId: preparation.powers.preparationId, powerCardId: preparation.powers.inventory[0].id, targetId: joined.selfId }
      assert.equal(errorCode(await command(host, 'game:use-power', { ...fields, powerCardId: 'invented-card' })), 'POWER_NOT_OWNED')
      assert.equal(errorCode(await command(host, 'game:use-power', { ...fields, targetId: created.selfId })), 'INVALID_TARGET')
      assert.equal(errorCode(await command(host, 'game:use-power', { ...fields, targetId: 'invented-target' })), 'INVALID_TARGET')
      assert.equal(errorCode(await command(host, 'game:use-power', { ...fields, roundId: 0 })), 'STALE_ROUND')
      assert.equal(errorCode(await command(host, 'game:use-power', { ...fields, questionInstanceId: 'old-preparation' })), 'STALE_QUESTION')
      const request = { requestId: randomUUID(), ...fields }
      const used = game(await service.command(host, 'game:use-power', request))
      assert.equal(used.powers.inventory.length, 0)
      assert.equal(used.powers.used, true)
      assert.equal(used.powers.ready, true)
      assert.equal(used.powers.readyCount, 1)
      assert.deepEqual(used.powers.targetedIds, [joined.selfId])
      assert.equal((await currentGame(guest)).powers.effect!.fromId, created.selfId)
      const replay = game(await service.command(host, 'game:use-power', request))
      assert.equal(replay.version, used.version)
      assert.deepEqual(replay.powers, used.powers)
      assert.equal(errorCode(await service.command(host, 'game:use-power', { ...request, targetId: thirdRoom.selfId })), 'REQUEST_REUSED')

      const attempts = await Promise.all([guest, third].map((connection, index) => command(connection, 'game:use-power', {
        ...fields, powerCardId: [guestPreparation, thirdPreparation][index].powers.inventory[0].id, targetId: created.selfId,
      })))
      assert.equal(attempts.filter(response => response.ok).length, 1)
      assert.equal(errorCode(attempts.find(response => !response.ok)!), 'TARGET_PROTECTED')
      const rejectedIndex = attempts.findIndex(response => !response.ok)
      const rejected = [guest, third][rejectedIndex]
      const stillPreparing = await currentGame(rejected)
      assert.equal(stillPreparing.phase, 'category_reveal')
      assert.equal(stillPreparing.powers.inventory.length, 1)
      assert.equal(stillPreparing.powers.readyCount, 2)
      assert.equal(now < preparation.deadline!, true)
      const question = game(await command(rejected, 'game:ready-question', fields))
      assert.equal(question.phase, 'question')
      assert.equal(question.opensAt, now)
      assert.equal(question.powers.preparationId, null)
      const saved = await savedGame(preparation.id)
      assert.equal(saved.rounds[0].powerPlays!.length, 2)
      assert.equal(new Set(saved.rounds[0].powerPlays!.map(play => play.targetId)).size, 2)
      assert.equal(saved.powerInventories![created.selfId].length, 0)
      const receipts = await database.transaction(db => db.query<{ count: number }>('SELECT count(*)::integer AS count FROM kb_receipts WHERE guest_id=$1 AND request_id=$2', [host.guestId, request.requestId]))
      assert.equal(receipts.rows[0].count, 1)
    })

    await t.test('fog clearing and shuffle preserve private effects, stable answer IDs and durable receipts', async () => {
      for (const kind of ['fog', 'shuffle'] as const) {
        const { host, guest, created, joined } = await party()
        const voting = await start(host, created.id)
        const voteFields = { matchId: voting.id, roundId: voting.round, categoryId: 'animals' }
        game(await command(host, 'game:vote-category', voteFields))
        const preparation = game(await command(guest, 'game:vote-category', voteFields))
        await setPowerKind(preparation.id, created.selfId, kind)
        const fields = { matchId: preparation.id, roundId: preparation.round, questionInstanceId: preparation.powers.preparationId }
        const hostCard = (await currentGame(host)).powers.inventory[0]
        assert.equal(hostCard.kind, kind)
        game(await command(host, 'game:use-power', { ...fields, powerCardId: hostCard.id, targetId: joined.selfId }))
        const question = game(await command(guest, 'game:ready-question', fields))
        assert.equal(question.phase, 'question')
        assert.equal(question.powers.effect!.kind, kind)
        assert.equal((await currentGame(guest)).selfAnswer, null)
        if (kind === 'fog') {
          assert.equal(errorCode(await command(guest, 'game:answer', { ...fields, optionId: 'a' })), 'POWER_BLOCKED')
          assert.ok(question.question!.options.every(option => option.text === ''))
          assert.ok((await currentGame(host)).question!.options.every(option => option.text.length > 0))
          assert.equal(errorCode(await command(guest, 'game:clear-power', { ...fields, optionId: 'invented-option' })), 'INVALID_OPTION')
          const request = { requestId: randomUUID(), ...fields, optionId: 'a' }
          const cleared = game(await service.command(guest, 'game:clear-power', request))
          assert.deepEqual(cleared.powers.effect!.revealedOptionIds, ['a'])
          assert.equal(cleared.question!.options.find(option => option.id === 'a')!.text, 'Option a')
          assert.equal(cleared.question!.options.filter(option => option.text === '').length, 3)
          assert.deepEqual(game(await service.command(guest, 'game:clear-power', request)).powers.effect, cleared.powers.effect)
          assert.equal(errorCode(await service.command(guest, 'game:clear-power', { ...request, optionId: 'b' })), 'REQUEST_REUSED')
          assert.equal(errorCode(await command(guest, 'game:clear-power', fields)), 'INVALID_OPTION')
          assert.equal(errorCode(await command(guest, 'game:clear-power', { ...fields, optionId: 'a' })), 'POWER_ALREADY_CLEARED')
        } else {
          assert.equal((await currentGame(host)).powers.effect, null)
          assert.deepEqual(question.question!.options, (await currentGame(host)).question!.options)
          assert.equal(errorCode(await command(guest, 'game:clear-power', { ...fields, optionId: 'a' })), 'NO_CLEARABLE_POWER')
          assert.equal(errorCode(await command(guest, 'game:clear-power', { ...fields, powerStep: 1 })), 'INVALID_REQUEST')
        }
        const accepted = game(await command(guest, 'game:answer', { ...fields, optionId: 'a' }))
        assert.equal(accepted.selfAnswer, 'a')
        assert.equal(accepted.answeredCount, 1)
        assert.equal(accepted.powers.inventory.length, 1)
        assert.equal((await currentGame(host)).powers.inventory.length, 0)
      }
    })

    await t.test('recovery preserves consumed powers without new deals and old receipts cannot clear a replacement question', async () => {
      const { host, guest, created, joined } = await party()
      const voting = await start(host, created.id)
      const voteFields = { matchId: voting.id, roundId: voting.round, categoryId: 'animals' }
      game(await command(host, 'game:vote-category', voteFields))
      const preparation = game(await command(guest, 'game:vote-category', voteFields))
      await setPowerKind(preparation.id, created.selfId, 'fog')
      await setPowerKind(preparation.id, joined.selfId, 'shuffle')
      const fields = { matchId: preparation.id, roundId: preparation.round, questionInstanceId: preparation.powers.preparationId }
      const hostRequest = { requestId: randomUUID(), ...fields, powerCardId: (await currentGame(host)).powers.inventory[0].id, targetId: joined.selfId }
      const guestRequest = { requestId: randomUUID(), ...fields, powerCardId: (await currentGame(guest)).powers.inventory[0].id, targetId: created.selfId }
      game(await service.command(host, 'game:use-power', hostRequest))
      const original = game(await service.command(guest, 'game:use-power', guestRequest))
      assert.equal(original.phase, 'question')
      const clearRequest = { requestId: randomUUID(), ...fields, optionId: 'a' }
      assert.deepEqual(game(await service.command(guest, 'game:clear-power', clearRequest)).powers.effect!.revealedOptionIds, ['a'])
      assert.equal(errorCode(await command(host, 'game:clear-power', { ...fields, optionId: 'a' })), 'NO_CLEARABLE_POWER')
      const inventories = (await savedGame(preparation.id)).powerInventories
      assert.deepEqual(Object.values(inventories!).map(cards => cards.length), [0, 0])

      await service.drain()
      service = new LobbyService(database, { now: () => now, gameContent, gameConfig })
      await service.initialize()
      const returningHost = { guestId: host.guestId, socketId: randomUUID() }
      const returningGuest = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returningHost), true)
      assert.equal((await currentGame(returningHost)).phase, 'suspended')
      assert.equal(await service.connect(returningGuest), true)
      await state(returningGuest)
      await service.sweep()
      const replacementPreparation = await currentGame(returningGuest)
      assert.equal(replacementPreparation.phase, 'category_reveal')
      assert.notEqual(replacementPreparation.powers.preparationId, original.question!.instanceId)
      assert.equal(replacementPreparation.round, original.round)
      assert.equal(replacementPreparation.powers.inventory.length, 0)
      assert.deepEqual(replacementPreparation.powers.effect!.revealedOptionIds, [])
      assert.deepEqual((await currentGame(returningHost)).powers.effect!.revealedOptionIds, [])
      assert.deepEqual((await savedGame(preparation.id)).powerInventories, inventories)
      const replay = game(await service.command(returningHost, 'game:use-power', hostRequest))
      assert.equal(replay.powers.inventory.length, 0)
      assert.equal(replay.powers.ready, false)
      assert.equal(replay.powers.readyCount, 0)
      assert.equal(errorCode(await command(returningHost, 'game:use-power', { ...hostRequest, requestId: randomUUID() })), 'STALE_QUESTION')
      const replacementFields = { matchId: replacementPreparation.id, roundId: replacementPreparation.round, questionInstanceId: replacementPreparation.powers.preparationId }
      game(await command(returningHost, 'game:ready-question', replacementFields))
      const replacement = game(await command(returningGuest, 'game:ready-question', replacementFields))
      assert.equal(replacement.phase, 'question')
      assert.notEqual(replacement.question!.id, original.question!.id)
      const clearingReplay = game(await service.command(returningGuest, 'game:clear-power', clearRequest))
      assert.deepEqual(clearingReplay.powers.effect!.revealedOptionIds, [])
      assert.equal(clearingReplay.question!.instanceId, replacement.question!.instanceId)
      assert.equal(errorCode(await command(returningGuest, 'game:clear-power', { ...clearRequest, requestId: randomUUID() })), 'STALE_QUESTION')
      assert.deepEqual(game(await command(returningGuest, 'game:clear-power', { ...replacementFields, optionId: 'a' })).powers.effect!.revealedOptionIds, ['a'])
      const saved = await savedGame(preparation.id)
      assert.equal(saved.rounds[0].powerPlays!.length, 2)
      assert.equal(saved.rounds[0].powersDealt, true)
      assert.deepEqual(saved.powerInventories, inventories)
      assert.deepEqual(saved.rounds[0].questionInstances.map(instance => instance.status), ['voided', 'open'])
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

    await t.test('a host retiring from a manual pause lets the survivor return to lobby without losing saved scores', async () => {
      for (const phase of ['intro', 'round_ready'] as const) {
        const { host, guest, created, joined } = await party()
        let paused: GameSnapshot
        if (phase === 'intro') {
          game(await command(host, 'game:start', { roomId: created.id }))
          paused = await tick(host)
        } else {
          await start(host, created.id)
          const question = await voteBoth(host, guest)
          const fields = { matchId: question.id, roundId: question.round, questionInstanceId: question.question!.instanceId, optionId: 'a' }
          game(await command(host, 'game:answer', fields))
          now += 20
          game(await command(guest, 'game:answer', fields))
          await tick(host)
          paused = await tick(host)
        }
        assert.equal(paused.phase, phase)
        assert.deepEqual(await command(host, 'room:leave'), { ok: true, room: null })
        const survivor = await state(guest)
        assert.equal(survivor.members.length, 1)
        assert.equal(survivor.hostId, joined.selfId)
        if (phase === 'intro') {
          assert.equal(survivor.status, 'waiting')
          assert.equal(survivor.game, null)
        } else {
          assert.equal(survivor.game!.phase, 'aborted')
          assert.deepEqual(survivor.game!.players.map(player => player.points), paused.players.map(player => player.points))
          const returned = room(await command(guest, 'game:return-lobby', { matchId: paused.id }))
          assert.equal(returned.status, 'waiting')
          assert.equal(returned.game, null)
        }
        const saved = await database.transaction(db => db.query<{ active: boolean; state: { phase: string; players: { id: string; points: number; retired: boolean }[] } }>('SELECT active,state FROM kb_matches WHERE id=$1', [paused.id]))
        assert.equal(saved.rows[0].active, false)
        assert.equal(saved.rows[0].state.phase, 'aborted')
        assert.equal(saved.rows[0].state.players.find(player => player.id === created.selfId)!.retired, true)
        for (const player of paused.players) assert.equal(saved.rows[0].state.players.find(savedPlayer => savedPlayer.id === player.id)!.points, player.points)
        const newcomer = await player()
        const rejoined = room(await command(newcomer, 'room:join', { code: created.code, identity: identity('New guest') }))
        assert.equal(rejoined.members.length, 2)
        assert.equal(game(await command(guest, 'game:start', { roomId: created.id })).phase, 'countdown')
      }
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

    await t.test('persisted intro timers and between-round pauses recover without a timer or an automatic new round', async () => {
      const { host, guest, created } = await party()
      game(await command(host, 'game:start', { roomId: created.id }))
      const intro = await tick(host)
      await database.transaction(async db => {
        const result = await db.query<{ state: Record<string, unknown> }>('SELECT state FROM kb_matches WHERE id=$1', [intro.id])
        result.rows[0].state.deadline = now + 10_000
        await db.query('UPDATE kb_matches SET state=$1::jsonb WHERE id=$2', [JSON.stringify(result.rows[0].state), intro.id])
      })
      await service.drain()
      service = new LobbyService(database, { now: () => now, gameContent, gameConfig })
      await service.initialize()
      now += 100_000
      await service.sweep()
      const returningHost = { guestId: host.guestId, socketId: randomUUID() }
      const returningGuest = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returningHost), true)
      const restored = await currentGame(returningHost)
      assert.equal(restored.phase, 'intro')
      assert.equal(restored.deadline, null)
      assert.equal(errorCode(await command(returningHost, 'game:continue', { matchId: intro.id, roundId: 0, expectedPhase: 'intro' })), 'NOT_ENOUGH_PLAYERS')
      assert.equal(await service.connect(returningGuest), true)
      await state(returningGuest)
      await service.sweep()
      assert.equal((await currentGame(returningGuest)).phase, 'intro')
      game(await command(returningGuest, 'game:continue', { matchId: intro.id, roundId: 0, expectedPhase: 'intro' }))
      const question = await voteBoth(returningHost, returningGuest)
      const answerFields = { matchId: question.id, roundId: question.round, questionInstanceId: question.question!.instanceId, optionId: 'a' }
      game(await command(returningHost, 'game:answer', answerFields))
      game(await command(returningGuest, 'game:answer', answerFields))
      assert.equal((await tick(returningHost)).phase, 'scoreboard')
      const ready = await tick(returningHost)
      assert.equal(ready.phase, 'round_ready')
      assert.equal(ready.round, 1)
      assert.equal(ready.deadline, null)
      await service.drain()
      service = new LobbyService(database, { now: () => now, gameContent, gameConfig })
      await service.initialize()
      now += 100_000
      await service.sweep()
      const secondHost = { guestId: host.guestId, socketId: randomUUID() }
      const secondGuest = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(secondHost), true)
      await state(secondHost)
      assert.equal(await service.connect(secondGuest), true)
      const pending = await currentGame(secondGuest)
      assert.equal(pending.phase, 'round_ready')
      assert.equal(pending.deadline, null)
      assert.equal(pending.round, 1)
      assert.deepEqual(pending.players.map(player => player.points), ready.players.map(player => player.points))
      await service.sweep()
      assert.equal((await currentGame(secondGuest)).phase, 'round_ready')
      assert.equal(errorCode(await command(secondGuest, 'game:continue', { matchId: ready.id, roundId: 1, expectedPhase: 'intro' })), 'WRONG_GAME_PHASE')
      const next = game(await command(secondGuest, 'game:continue', { matchId: ready.id, roundId: 1, expectedPhase: 'round_ready' }))
      assert.equal(next.phase, 'category_vote')
      assert.equal(next.round, 2)
      assert.equal(errorCode(await command(secondHost, 'game:continue', { matchId: ready.id, roundId: 1, expectedPhase: 'round_ready' })), 'STALE_ROUND')
      const saved = await database.transaction(db => db.query<{ state: { rounds: unknown[] } }>('SELECT state FROM kb_matches WHERE id=$1', [ready.id]))
      assert.equal(saved.rows[0].state.rounds.length, 2)
    })
  } finally {
    await service.drain()
    await database.close()
  }
})
