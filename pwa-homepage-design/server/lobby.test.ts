import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { validateIdentity } from '../features/rooms/lib/validation'
import type { RoomAction, RoomResponse, RoomSnapshot } from '../features/rooms/types'
import { createDatabase } from './database'
import { LobbyService, type Connection } from './lobby'

const identity = (nickname: string) => ({ nickname, avatarId: 'dog' as const })
function room(response: RoomResponse): RoomSnapshot {
  assert.equal(response.ok, true, JSON.stringify(response))
  assert.ok(response.ok && response.room)
  return response.room
}
function errorCode(response: RoomResponse): string {
  assert.equal(response.ok, false, JSON.stringify(response))
  assert.ok(!response.ok)
  return response.error.code
}

test('saved identities keep their nickname when an emoji avatar becomes a Kenney animal', () => {
  for (const [legacyId, avatarId] of [['fox', 'dog'], ['tiger', 'bear'], ['unicorn', 'narwhal'], ['octopus', 'whale']]) {
    assert.deepEqual(validateIdentity({ nickname: '  Returning player  ', avatarId: legacyId }), {
      identity: { nickname: 'Returning player', avatarId },
    })
  }
})

test('durable PostgreSQL lobby invariants', async (t) => {
  const database = await createDatabase({ dataDir: 'memory://' })
  let now = Date.now()
  let service = new LobbyService(database, { now: () => now })
  await service.initialize()
  const player = async () => {
    const guest = await service.guest()
    const connection: Connection = { guestId: guest.guestId, socketId: randomUUID() }
    assert.equal(await service.connect(connection), true)
    return { ...connection, token: guest.token }
  }
  const command = (connection: Connection, action: RoomAction, data: Record<string, unknown> = {}) => service.command(connection, action, { requestId: randomUUID(), ...data })

  try {
    await t.test('guest secrets are hashed and sessions are authenticated independently of nickname', async () => {
      const guest = await player()
      assert.equal(await service.authenticate(guest.token), guest.guestId)
      assert.equal(await service.authenticate('0'.repeat(64)), null)
      const stored = await database.transaction((db) => db.query('SELECT token_hash FROM kb_guests WHERE id = $1', [guest.guestId]))
      assert.notEqual(stored.rows[0].token_hash, guest.token)
      assert.equal(String(stored.rows[0].token_hash).length, 64)
      const sameGuest = await service.guest(guest.token)
      assert.equal(sameGuest.guestId, guest.guestId)
      assert.equal(sameGuest.minted, false)
    })

    await t.test('two concurrent requests compete for one tenth slot, counting reserved seats', async () => {
      const host = await player()
      const created = room(await command(host, 'room:create', { identity: identity('Host') }))
      let reservedPlayer: Connection | undefined
      for (let index = 1; index < 9; index++) {
        now++
        reservedPlayer = await player()
        room(await command(reservedPlayer, 'room:join', { code: created.code, identity: identity(`Player ${index}`) }))
      }
      await service.disconnect(reservedPlayer!)
      const [first, second] = await Promise.all([player(), player()])
      const results = await Promise.all([
        command(first, 'room:join', { code: created.code, identity: identity('Tenth') }),
        command(second, 'room:join', { code: created.code, identity: identity('Eleventh') }),
      ])
      assert.equal(results.filter((response) => response.ok).length, 1)
      assert.equal(errorCode(results.find((response) => !response.ok)!), 'ROOM_FULL')
      const snapshot = room(await command(host, 'room:resume'))
      assert.equal(snapshot.members.length, 10)
      assert.equal(snapshot.members.filter((member) => !member.connected).length, 1)
      assert.equal(snapshot.hostId, snapshot.selfId)
    })

    await t.test('equivalent nicknames cannot be accepted simultaneously; avatars can repeat', async () => {
      const host = await player()
      const created = room(await command(host, 'room:create', { identity: identity('Nickname host') }))
      const [first, second] = await Promise.all([player(), player()])
      const results = await Promise.all([
        command(first, 'room:join', { code: created.code, identity: identity('  Alice  Bob  ') }),
        command(second, 'room:join', { code: created.code, identity: identity('ALICE BOB') }),
      ])
      assert.equal(results.filter((response) => response.ok).length, 1)
      assert.equal(errorCode(results.find((response) => !response.ok)!), 'NICKNAME_TAKEN')
      const joined = room(results.find((response) => response.ok)!)
      assert.equal(joined.members.length, 2)
      assert.equal(joined.members.every((member) => member.avatarId === 'dog'), true)
    })

    await t.test('a session cannot enter two rooms or create two rooms concurrently', async () => {
      const targetA = room(await command(await player(), 'room:create', { identity: identity('Room A') }))
      const targetB = room(await command(await player(), 'room:create', { identity: identity('Room B') }))
      const guest = await player()
      const results = await Promise.all([
        command(guest, 'room:join', { code: targetA.code, identity: identity('Same guest') }),
        command(guest, 'room:join', { code: targetB.code, identity: identity('Same guest') }),
      ])
      assert.equal(results.filter((response) => response.ok).length, 1)
      assert.equal(errorCode(results.find((response) => !response.ok)!), 'ALREADY_IN_ROOM')
      const creator = await player()
      const created = await Promise.all([
        command(creator, 'room:create', { identity: identity('Create once') }),
        command(creator, 'room:create', { identity: identity('Create twice') }),
      ])
      assert.equal(created.filter((response) => response.ok).length, 1)
    })

    await t.test('durable receipts prevent duplicate creates and reject changed parameters', async () => {
      const guest = await player()
      const requestId = randomUUID()
      const payload = { requestId, identity: identity('Retry') }
      const [a, b] = await Promise.all([service.command(guest, 'room:create', payload), service.command(guest, 'room:create', payload)])
      assert.equal(room(a).id, room(b).id)
      assert.equal(room(b).members.length, 1)
      assert.equal(errorCode(await service.command(guest, 'room:create', { ...payload, identity: identity('Different') })), 'REQUEST_REUSED')
      // Object key order is not a semantic parameter change.
      assert.equal(room(await service.command(guest, 'room:create', { requestId, identity: { avatarId: 'dog', nickname: 'Retry' } })).id, room(a).id)
    })

    await t.test('legacy avatars in saved rooms and receipts resume as the matching Kenney animal', async () => {
      const guest = await player()
      const request = { requestId: randomUUID(), identity: { nickname: 'Legacy avatar', avatarId: 'unicorn' } }
      const created = room(await service.command(guest, 'room:create', request))
      assert.equal(created.members[0].avatarId, 'narwhal')
      // Simulate a room persisted before the artwork changed; no SQL migration is required.
      await database.transaction((db) => db.query('UPDATE kb_members SET avatar_id = $1 WHERE id = $2', ['unicorn', created.selfId]))
      const resumed = room(await command(guest, 'room:resume'))
      assert.equal(resumed.selfId, created.selfId)
      assert.equal(resumed.members[0].avatarId, 'narwhal')
      const replayed = room(await service.command(guest, 'room:create', request))
      assert.equal(replayed.id, created.id)
      assert.equal(replayed.members.length, 1)
      assert.equal(replayed.members[0].avatarId, 'narwhal')
      const updated = room(await command(guest, 'room:update', { identity: { nickname: 'Renamed player', avatarId: resumed.members[0].avatarId } }))
      assert.equal(updated.members[0].nickname, 'Renamed player')
      assert.equal(updated.members[0].avatarId, 'narwhal')
    })

    await t.test('explicit leave invalidates old create/join retries without touching a later room', async () => {
      const guest = await player()
      const create = { requestId: randomUUID(), identity: identity('Leave safely') }
      const oldRoom = room(await service.command(guest, 'room:create', create))
      assert.deepEqual(await command(guest, 'room:leave'), { ok: true, room: null })
      assert.deepEqual(await service.command(guest, 'room:create', create), { ok: true, room: null })
      assert.equal((await service.preview(guest.guestId, { code: oldRoom.code })).ok, false)
      const target = room(await command(await player(), 'room:create', { identity: identity('Join target') }))
      const joinRequest = { requestId: randomUUID(), code: target.code, identity: identity('Leave safely') }
      room(await service.command(guest, 'room:join', joinRequest))
      await command(guest, 'room:leave')
      const newRoom = room(await command(guest, 'room:create', { identity: identity('New room') }))
      assert.deepEqual(await service.command(guest, 'room:join', joinRequest), { ok: true, room: null })
      assert.equal(room(await command(guest, 'room:resume')).id, newRoom.id)
    })

    await t.test('preview and invalid inputs never occupy a seat', async () => {
      const host = await player()
      const created = room(await command(host, 'room:create', { identity: identity('Preview host') }))
      const guest = await player()
      assert.deepEqual(await service.preview(guest.guestId, { code: ` ${created.code.toLowerCase()} ` }), { ok: true, preview: { code: created.code, memberCount: 1, maxPlayers: 10 } })
      assert.equal(errorCode(await command(guest, 'room:join', { code: created.code, identity: identity('x') })), 'INVALID_NICKNAME')
      assert.equal(errorCode(await command(guest, 'room:join', { code: '000000', identity: identity('Valid') })), 'INVALID_CODE')
      assert.equal(errorCode(await command(guest, 'room:join', { code: created.code, identity: { nickname: 'Valid', avatarId: 'unlisted' } })), 'INVALID_AVATAR')
      assert.equal(room(await command(host, 'room:resume')).members.length, 1)
      const joined = room(await command(guest, 'room:join', { code: created.code, identity: identity('Valid') }))
      assert.equal(errorCode(await command(guest, 'room:update', { identity: identity(' preview HOST ') })), 'NICKNAME_TAKEN')
      const updated = room(await command(guest, 'room:update', { identity: { nickname: 'Updated', avatarId: 'frog' } }))
      assert.ok(updated.version > joined.version)
      assert.equal(updated.members.find((member) => member.id === updated.selfId)?.nickname, 'Updated')
    })

    await t.test('refresh restores the same seat; takeover fences the previous socket and delayed disconnect', async () => {
      const guest = await player()
      const created = room(await command(guest, 'room:create', { identity: identity('Reconnect') }))
      await service.disconnect(guest)
      const disconnected = (await service.snapshots([guest.guestId])).get(guest.guestId)!
      assert.ok(disconnected)
      assert.equal(disconnected.members[0].connected, false)
      assert.equal(Date.parse(disconnected.members[0].reservedUntil!), now + 90_000)
      const replacement = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(replacement), true)
      const resumed = room(await command(replacement, 'room:resume'))
      assert.equal(resumed.selfId, created.selfId)
      assert.equal(resumed.members[0].connected, true)
      const secondary = { guestId: guest.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(secondary), false)
      assert.equal(errorCode(await command(secondary, 'room:leave')), 'CONTROL_REQUIRED')
      const takeover = await service.takeover(secondary)
      assert.equal(takeover.previousSocketId, replacement.socketId)
      assert.equal(room(takeover.response).selfId, created.selfId)
      assert.equal(errorCode(await command(replacement, 'room:leave')), 'CONTROL_REQUIRED')
      await service.disconnect(replacement)
      assert.equal(room(await command(secondary, 'room:resume')).members[0].connected, true)
    })

    await t.test('host transfers only after leave or reservation expiry; expired seats cannot be silently revived', async () => {
      const host = await player()
      const created = room(await command(host, 'room:create', { identity: identity('Departing host') }))
      now++
      const guest = await player()
      const joined = room(await command(guest, 'room:join', { code: created.code, identity: identity('Successor') }))
      await service.disconnect(host)
      assert.equal(room(await command(guest, 'room:resume')).hostId, created.selfId)
      now += 90_001
      await service.sweep()
      const afterExpiry = room(await command(guest, 'room:resume'))
      assert.equal(afterExpiry.hostId, joined.selfId)
      assert.equal(afterExpiry.members.length, 1)
      const returning = { guestId: host.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(returning), true)
      assert.deepEqual(await command(returning, 'room:resume'), { ok: true, room: null })
      const rejoined = room(await command(returning, 'room:join', { code: created.code, identity: identity('Returning') }))
      assert.notEqual(rejoined.selfId, created.selfId)
      assert.equal(rejoined.hostId, joined.selfId)
      await command(guest, 'room:leave')
      assert.equal(room(await command(returning, 'room:resume')).hostId, rejoined.selfId)
    })

    await t.test('server restart reserves previously online members and honors existing offline deadlines', async () => {
      const host = await player()
      const created = room(await command(host, 'room:create', { identity: identity('Restart host') }))
      const guest = await player()
      room(await command(guest, 'room:join', { code: created.code, identity: identity('Restart guest') }))
      await service.disconnect(guest)
      const deadline = now + 90_000
      now += 10_000
      service = new LobbyService(database, { now: () => now })
      await service.initialize()
      const restarted = (await service.snapshots([host.guestId])).get(host.guestId)!
      assert.ok(restarted)
      assert.equal(restarted.members.every((member) => !member.connected), true)
      assert.equal(restarted.members.find((member) => member.id !== created.selfId)?.reservedUntil, new Date(deadline).toISOString())
      const replacement = { guestId: host.guestId, socketId: randomUUID() }
      assert.equal(await service.connect(replacement), true)
      const resumed = room(await command(replacement, 'room:resume'))
      assert.equal(resumed.selfId, created.selfId)
      assert.equal(resumed.members.find((member) => member.id === created.selfId)?.connected, true)
    })

    await t.test('inactivity closes a lobby and expired guest credentials cannot recover seats', async () => {
      const guest = await player()
      const created = room(await command(guest, 'room:create', { identity: identity('Idle') }))
      now += 60 * 60_000 + 1
      await service.sweep()
      assert.deepEqual(await command(guest, 'room:resume'), { ok: true, room: null })
      assert.equal((await service.preview(guest.guestId, { code: created.code })).ok, false)
      now += 24 * 60 * 60_000
      assert.equal(await service.authenticate(guest.token), null)
      assert.equal(errorCode(await command(guest, 'room:resume')), 'SESSION_EXPIRED')
      await service.sweep()
      const count = await database.transaction((db) => db.query('SELECT count(*)::integer AS count FROM kb_guests'))
      assert.equal(count.rows[0].count, 0)
    })
  } finally { await database.close() }
})

test('filesystem database and receipts survive closing and reopening the engine', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowbetter-lobby-'))
  try {
    let database = await createDatabase({ dataDir: directory })
    let service = new LobbyService(database)
    await service.initialize()
    const guest = await service.guest()
    const old = { guestId: guest.guestId, socketId: randomUUID() }
    await service.connect(old)
    const request = { requestId: randomUUID(), identity: identity('Persistent') }
    const created = room(await service.command(old, 'room:create', request))
    await database.close()
    database = await createDatabase({ dataDir: directory })
    try {
      service = new LobbyService(database)
      await service.initialize()
      assert.equal(await service.authenticate(guest.token), guest.guestId)
      const replacement = { guestId: guest.guestId, socketId: randomUUID() }
      await service.connect(replacement)
      const replayed = room(await service.command(replacement, 'room:create', request))
      assert.equal(replayed.id, created.id)
      assert.equal(replayed.selfId, created.selfId)
      assert.equal(replayed.members.length, 1)
      assert.equal(replayed.members[0].connected, true)
    } finally { await database.close() }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
