import type { Server } from 'node:http'
import type { Socket } from 'node:net'

interface ShutdownResources {
  http: Pick<Server, 'on'>
  io: { close(): Promise<void> }
  nextApp?: { close(): Promise<void> } | null
  lobby: { drain(): Promise<void> }
  database: { close(): Promise<void> }
  stopTimer(): void
}

export function createShutdown(resources: ShutdownResources): () => Promise<void> {
  const connections = new Set<Socket>()
  let stopping = false
  let closing: Promise<void> | undefined

  resources.http.on('connection', (socket: Socket) => {
    if (stopping) { socket.destroy(); return }
    connections.add(socket)
    socket.once('close', () => connections.delete(socket))
  })

  return () => {
    if (closing) return closing
    stopping = true
    closing = Promise.resolve().then(async () => {
      resources.stopTimer()
      const failures: unknown[] = []
      const attempt = async (operation: () => Promise<void>) => {
        try { await operation() } catch (error) { failures.push(error) }
      }

      // Socket.IO also closes HTTP, but its callback can wait forever for
      // Next's HMR WebSockets. They must be closed explicitly, too.
      let realtimeClosed: Promise<void>
      try { realtimeClosed = resources.io.close() }
      catch (error) { realtimeClosed = Promise.reject(error) }
      for (const socket of connections) socket.destroy()
      await attempt(() => realtimeClosed)
      await attempt(async () => { await resources.nextApp?.close() })
      await attempt(() => resources.lobby.drain())
      await attempt(() => resources.database.close())
      if (failures.length) throw new AggregateError(failures, 'Server shutdown failed.')
    })
    return closing
  }
}

type ShutdownSignal = 'SIGINT' | 'SIGTERM'
interface SignalRuntime {
  on(event: ShutdownSignal, listener: () => void): unknown
  off(event: ShutdownSignal, listener: () => void): unknown
  exit(code: number): void
}

export function registerShutdownSignals(
  close: () => Promise<void>,
  options: { runtime?: SignalRuntime; timeoutMs?: number; logger?: Pick<Console, 'warn' | 'error'> } = {},
): () => void {
  const runtime = options.runtime ?? process
  const logger = options.logger ?? console
  let closing = false
  let exited = false
  let deadline: ReturnType<typeof setTimeout> | undefined

  const exit = (code: number) => {
    if (exited) return
    exited = true
    clearTimeout(deadline)
    runtime.exit(code)
  }
  const shutdown = () => {
    if (closing) {
      logger.warn('Shutdown interrupted again. Forcing exit.')
      exit(1)
      return
    }
    closing = true
    logger.warn('Shutting down Know Better…')
    deadline = setTimeout(() => {
      logger.error('Shutdown did not finish within the time limit. Forcing exit.')
      exit(1)
    }, options.timeoutMs ?? 10_000)
    deadline.unref()
    void Promise.resolve().then(close).then(() => {
      if (exited) return
      logger.warn('Chiusura completata: database chiuso.')
      exit(0)
    }, (error) => {
      logger.error('Server shutdown failed.', error)
      exit(1)
    })
  }

  runtime.on('SIGINT', shutdown)
  runtime.on('SIGTERM', shutdown)
  return () => {
    clearTimeout(deadline)
    runtime.off('SIGINT', shutdown)
    runtime.off('SIGTERM', shutdown)
  }
}
