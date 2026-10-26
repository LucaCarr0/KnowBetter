import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { io, type Socket } from 'socket.io-client'
import type { RoomResponse, RoomSnapshot } from '../features/rooms/types'
import { createDatabase } from './database'
import { createLobbyServer } from './index'

const timeout = 5_000
async function openSocket(url: string, cookie: string, headers: Record<string, string> = {}): Promise<Socket> {
  const socket = io(url, { autoConnect: false, transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Cookie: cookie, ...headers } })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), timeout)
    socket.once('connect', () => { clearTimeout(timer); resolve() })
    socket.once('connect_error', (error) => { clearTimeout(timer); socket.close(); reject(error) })
    socket.connect()
  })
  return socket
}

async function request(socket: Socket, action: string, data: Record<string, unknown> = {}): Promise<RoomResponse> {
  return socket.timeout(timeout).emitWithAck(action, { requestId: randomUUID(), ...data })
}

test('same-origin HTTP guest cookie and realtime multi-device lobby', async () => {
  const database = await createDatabase({ dataDir: 'memory://' })
  const server = await createLobbyServer({ database, port: 0, hostname: '127.0.0.1', secureCookies: false, requestHandler: (_request, response) => { response.writeHead(404); response.end() } })
  const sockets: Socket[] = []
  try {
    const port = await server.listen()
    const url = `http://127.0.0.1:${port}`
    const guest = async () => {
      const response = await fetch(`${url}/api/guest`)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { ok: true })
      const header = response.headers.get('set-cookie')!
      assert.match(header, /HttpOnly; SameSite=Lax/)
      assert.match(header, /Max-Age=86[34]\d\d/)
      return header.split(';')[0]
    }
    const denied = await fetch(`${url}/api/guest`, { headers: { Origin: 'https://hostile.example' } })
    assert.equal(denied.status, 403)
    assert.equal((await fetch(`${url}/api/guest`, { method: 'POST' })).status, 405)
    await assert.rejects(openSocket(url, ''), /Guest session missing or expired/)

    const hostCookie = await guest()
    const retainedCookie = await fetch(`${url}/api/guest`, { headers: { Cookie: hostCookie } })
    assert.equal(retainedCookie.headers.get('set-cookie')?.split(';')[0], hostCookie)
    await assert.rejects(openSocket(url, hostCookie, { Origin: 'https://hostile.example' }))
    const host = await openSocket(url, hostCookie)
    sockets.push(host)
    const created = await request(host, 'room:create', { identity: { nickname: 'Socket Host', avatarId: 'dog' } })
    assert.ok(created.ok && created.room)
    const code = created.room.code
    const hostId = created.room.selfId
    const guestSocket = await openSocket(url, await guest())
    sockets.push(guestSocket)
    const observed = new Promise<RoomSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Broadcast timeout')), timeout)
      const listener = (snapshot: RoomSnapshot | null) => {
        if (snapshot?.members.length === 2) { clearTimeout(timer); host.off('room:state', listener); resolve(snapshot) }
      }
      host.on('room:state', listener)
    })
    const preview = await guestSocket.timeout(timeout).emitWithAck('room:preview', { code })
    assert.deepEqual(preview, { ok: true, preview: { code, memberCount: 1, maxPlayers: 10 } })
    const joined = await request(guestSocket, 'room:join', { code, identity: { nickname: 'Socket Guest', avatarId: 'panda' } })
    assert.ok(joined.ok && joined.room)
    const broadcast = await observed
    assert.equal(broadcast.selfId, hostId)
    assert.equal(joined.room.members.length, 2)
    assert.notEqual(joined.room.selfId, hostId)
    // No session identifier, token or secret is present in any public snapshot.
    assert.equal(JSON.stringify(joined).includes('guest_id'), false)
    assert.equal(JSON.stringify(joined).includes(hostCookie.split('=')[1]), false)

    const secondary = await openSocket(url, hostCookie)
    sockets.push(secondary)
    const deniedMutation = await request(secondary, 'room:leave')
    assert.ok(!deniedMutation.ok)
    assert.equal(deniedMutation.error.code, 'CONTROL_REQUIRED')
    const transfer = await secondary.timeout(timeout).emitWithAck('room:takeover') as RoomResponse
    assert.ok(transfer.ok && transfer.room)
    assert.equal(transfer.room.selfId, hostId)
    const fenced = await request(host, 'room:update', { identity: { nickname: 'Old socket', avatarId: 'dog' } })
    assert.ok(!fenced.ok)
    assert.equal(fenced.error.code, 'CONTROL_REQUIRED')
    host.disconnect()
    const current = await request(secondary, 'room:resume')
    assert.ok(current.ok && current.room)
    assert.equal(current.room.members.find((member) => member.id === hostId)?.connected, true)
    assert.deepEqual(await request(secondary, 'room:leave'), { ok: true, room: null })
    const remaining = await request(guestSocket, 'room:resume')
    assert.ok(remaining.ok && remaining.room)
    assert.equal(remaining.room.members.length, 1)
    assert.equal(remaining.room.hostId, remaining.room.selfId)
  } finally {
    for (const socket of sockets) socket.close()
    await server.close()
  }
})
