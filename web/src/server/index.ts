import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import next from 'next'
import { Server as SocketServer, type Socket } from 'socket.io'
import type { RoomAction } from '../features/rooms/types'
import { createDatabase, type LobbyDatabase } from './database'
import { LobbyService, type Connection, type LobbyOptions } from './lobby'
import { createShutdown, registerShutdownSignals } from './shutdown'
import { importTrivia, loadTrivia } from './trivia'
import { TEXTS } from '../texts'

export const GUEST_COOKIE = 'kb_guest'
const actions: RoomAction[] = ['room:create', 'room:join', 'room:resume', 'room:update', 'room:leave', 'game:start', 'game:continue', 'game:vote-category', 'game:answer', 'game:bonus-answer', 'game:use-power', 'game:ready-question', 'game:clear-power', 'game:resume', 'game:return-lobby']
const internalError = { ok: false, error: { code: 'SERVER_ERROR', message: TEXTS.errors.serverError } } as const
const rateError = { ok: false, error: { code: 'RATE_LIMITED', message: TEXTS.errors.rateLimited } } as const

export function readGuestCookie(cookie: string | undefined): string | undefined {
  // Do not accept duplicate credential cookies, even when their paths differ.
  const values = cookie?.split(';').map((entry) => entry.trim()).filter((entry) => entry.startsWith(`${GUEST_COOKIE}=`)) ?? []
  if (values.length !== 1) return undefined
  const value = values[0].slice(GUEST_COOKIE.length + 1)
  return /^[a-f0-9]{64}$/.test(value) ? value : undefined
}

class RateLimit {
  private readonly entries = new Map<string, { count: number; reset: number }>()
  allow(key: string, maximum: number, periodMs: number): boolean {
    const now = Date.now()
    if (this.entries.size > 10_000) {
      for (const [key, bucket] of this.entries) if (bucket.reset <= now) this.entries.delete(key)
      if (this.entries.size > 10_000 && !this.entries.has(key)) return false
    }
    let bucket = this.entries.get(key)
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + periodMs }
      this.entries.set(key, bucket)
    }
    bucket.count += 1
    return bucket.count <= maximum
  }
}

export interface LobbyServerOptions extends LobbyOptions {
  dev?: boolean
  port?: number
  hostname?: string
  database?: LobbyDatabase
  dataDir?: string
  databaseUrl?: string
  origin?: string
  secureCookies?: boolean
  /** A lightweight handler allows real HTTP/socket integration tests without Next. */
  requestHandler?: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

export async function createLobbyServer(options: LobbyServerOptions = {}) {
  const dev = options.dev ?? process.env.NODE_ENV !== 'production'
  const hostname = options.hostname ?? '0.0.0.0'
  const port = options.port ?? Number(process.env.PORT ?? 3000)
  const database = options.database ?? await createDatabase({ url: options.databaseUrl ?? process.env.DATABASE_URL, dataDir: options.dataDir ?? process.env.LOBBY_DATA_DIR })
  let nextApp: ReturnType<typeof next> | null = null
  try {
  // Idempotent catalog import happens before a room can start. Rounds only
  // read the local database, so public catalog services cannot stall play.
  if (!options.gameContent) await importTrivia(database)
  const lobby = new LobbyService(database, { ...options, gameContent: options.gameContent ?? await loadTrivia(database) })
  await lobby.initialize()
  const limits = new RateLimit()
  const secure = options.secureCookies ?? !dev
  const configuredOrigin = options.origin ?? process.env.APP_ORIGIN
  // Use Webpack for local development while investigating silent hydration
  // failures with Turbopack on Android over the LAN (Next.js issue #94075).
  nextApp = options.requestHandler ? null : next({ dev, hostname, port, ...(dev ? { webpack: true } : {}) })
  if (nextApp) await nextApp.prepare()
  const handle = options.requestHandler ?? nextApp!.getRequestHandler()

  function sameOrigin(request: IncomingMessage): boolean {
    const supplied = request.headers.origin
    if (!supplied) return true // Same-origin fetches can omit Origin.
    try {
      const expected = configuredOrigin ?? `${secure ? 'https' : 'http'}://${request.headers.host}`
      return new URL(supplied).origin === new URL(expected).origin
    } catch { return false }
  }

  function json(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(JSON.stringify(body))
  }

  const http = createServer(async (request, response) => {
    try {
      if (request.url?.split('?')[0] !== '/api/guest') {
        await handle(request, response)
        return
      }
      if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); json(response, 405, { ok: false }); return }
      if (!sameOrigin(request) || request.headers['sec-fetch-site'] === 'cross-site') { json(response, 403, { ok: false }); return }
      const ip = request.socket.remoteAddress ?? 'unknown'
      if (!limits.allow(`guest:${ip}`, 60, 60_000)) { json(response, 429, rateError); return }
      const session = await lobby.guest(readGuestCookie(request.headers.cookie))
      response.setHeader('Set-Cookie', `${GUEST_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))}${secure ? '; Secure' : ''}`)
      json(response, 200, { ok: true })
    } catch (error) {
      console.error('Guest request failed', error)
      if (!response.headersSent) json(response, 500, internalError)
      else response.end()
    }
  })

  const io = new SocketServer(http, {
    maxHttpBufferSize: 16_384,
    // Disable cross-site requests for both HTTP polling and direct WebSocket.
    allowRequest(request, callback) {
      const ip = request.socket.remoteAddress ?? 'unknown'
      callback(null, sameOrigin(request) && limits.allow(`connect:${ip}`, 120, 60_000))
    },
  })

  io.use(async (socket, nextMiddleware) => {
    try {
      const guestId = await lobby.authenticate(readGuestCookie(socket.request.headers.cookie))
      if (!guestId) {
        const error = new Error('Guest session missing or expired.') as Error & { data?: unknown }
        error.data = { code: 'SESSION_EXPIRED' }
        nextMiddleware(error)
        return
      }
      socket.data.guestId = guestId
      nextMiddleware()
    } catch (error) { nextMiddleware(error instanceof Error ? error : new Error('Authentication failed.')) }
  })

  let publishing = false
  let publishAgain = false
  async function publish() {
    if (publishing) { publishAgain = true; return }
    publishing = true
    try {
      do {
        publishAgain = false
        const sockets = [...io.sockets.sockets.values()]
        const snapshots = await lobby.snapshots([...new Set(sockets.map((socket) => socket.data.guestId as string))])
        for (const socket of sockets) socket.emit('room:state', snapshots.get(socket.data.guestId) ?? null)
      } while (publishAgain)
    } catch (error) { console.error('Room publication failed', error) }
    finally { publishing = false }
  }
  lobby.on('change', () => { void publish() })

  function context(socket: Socket): Connection { return { guestId: socket.data.guestId as string, socketId: socket.id } }
  function canAct(socket: Socket): boolean { return limits.allow(`actions:${socket.data.guestId}`, 60, 10_000) }
  io.on('connection', (socket) => {
    // Registration and every event run through the service queue, so an event
    // arriving immediately after connect cannot race the ownership check.
    const registered = lobby.connect(context(socket))
    void registered.then((controlled) => { if (!controlled) socket.emit('session:conflict') }).catch((error) => { console.error('Socket registration failed', error); socket.disconnect(true) })
    for (const action of actions) {
      socket.on(action, async (command: unknown, ack: unknown) => {
        const receivedAt = options.now?.() ?? Date.now()
        if (typeof ack !== 'function') return
        try {
          await registered
          if (!canAct(socket)) { ack(rateError); return }
          ack(await lobby.command(context(socket), action, command, receivedAt))
        } catch (error) { console.error('Room command failed', error); ack(internalError) }
      })
    }
    socket.on('room:preview', async (command: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return
      try {
        await registered
        if (!limits.allow(`preview:${socket.data.guestId}`, 30, 10_000)) { ack(rateError); return }
        ack(await lobby.preview(socket.data.guestId as string, command))
      } catch (error) { console.error('Room preview failed', error); ack(internalError) }
    })
    socket.on('room:clock', (ack: unknown) => {
      if (typeof ack === 'function' && limits.allow(`clock:${socket.data.guestId}`, 10, 10_000)) ack(options.now?.() ?? Date.now())
    })
    socket.on('room:takeover', async (ack: unknown) => {
      if (typeof ack !== 'function') return
      try {
        await registered
        if (!canAct(socket)) { ack(rateError); return }
        const result = await lobby.takeover(context(socket))
        if (result.previousSocketId && result.previousSocketId !== socket.id) io.sockets.sockets.get(result.previousSocketId)?.emit('session:conflict')
        ack(result.response)
      } catch (error) { console.error('Room takeover failed', error); ack(internalError) }
    })
    socket.on('disconnect', () => { void registered.then(() => lobby.disconnect(context(socket))).catch((error) => console.error('Socket cleanup failed', error)) })
  })

  const timer = setInterval(() => { void lobby.sweep().catch((error) => console.error('Room expiry failed', error)) }, 250)
  timer.unref()
  const close = createShutdown({ http, io, nextApp, lobby, database, stopTimer: () => clearInterval(timer) })
  return {
    http, io, lobby,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        http.once('error', reject)
        http.listen(port, hostname, () => { http.off('error', reject); resolve() })
      })
      const address = http.address()
      return typeof address === 'object' && address ? address.port : port
    },
    close,
  }
  } catch (error) {
    const failures = [error]
    try { await nextApp?.close() } catch (closeError) { failures.push(closeError) }
    try { await database.close() } catch (closeError) { failures.push(closeError) }
    if (failures.length > 1) throw new AggregateError(failures, 'Server initialization and cleanup failed.')
    throw error
  }
}

function positiveDuration(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value < 1_000) throw new Error(`${name} must be at least 1000 milliseconds.`)
  return value
}

async function main() {
  let stopping = false
  let starting: ReturnType<typeof createLobbyServer> | undefined
  // Install the handler before the first asynchronous database/Next startup
  // operation, so Ctrl+C during preparation also drains and closes PGlite.
  registerShutdownSignals(async () => {
    stopping = true
    const server = await starting
    await server?.close()
  })
  starting = createLobbyServer({
    guestTtlMs: positiveDuration('GUEST_TTL_MS', 24 * 60 * 60_000),
    reservationMs: positiveDuration('ROOM_RESERVATION_MS', 90_000),
    roomTtlMs: positiveDuration('ROOM_IDLE_MS', 60 * 60_000),
  })
  const server = await starting
  if (stopping) return
  let port: number
  try { port = await server.listen() }
  catch (error) { await server.close(); throw error }
  if (stopping) return
  console.log(`Know Better ready on http://localhost:${port}`)
}

if (process.argv[1] && /(?:^|[/\\])server[/\\]index\.(?:ts|js)$/.test(process.argv[1])) {
  void main().catch((error) => { console.error(error); process.exitCode = 1 })
}
