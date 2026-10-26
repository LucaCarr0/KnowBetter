import { io, type Socket } from 'socket.io-client'
import type { RoomAction, RoomCommand, RoomError, RoomPreview, RoomResponse, RoomSnapshot } from '../types'
import type { GameAction } from '../../game/types'

export type RoomPreviewResponse =
  | { ok: true; preview: RoomPreview }
  | { ok: false; error: RoomError }

interface ServerEvents {
  'room:state': (room: RoomSnapshot | null) => void
  'session:conflict': () => void
}

type RoomAcknowledgement = (response: RoomResponse) => void

type ClientEvents = {
  'room:create': (command: RoomCommand, acknowledge: RoomAcknowledgement) => void
  'room:join': (command: RoomCommand, acknowledge: RoomAcknowledgement) => void
  'room:resume': (command: RoomCommand, acknowledge: RoomAcknowledgement) => void
  'room:update': (command: RoomCommand, acknowledge: RoomAcknowledgement) => void
  'room:leave': (command: RoomCommand, acknowledge: RoomAcknowledgement) => void
  'room:preview': (input: { code: string }, acknowledge: (response: RoomPreviewResponse) => void) => void
  'room:takeover': (acknowledge: RoomAcknowledgement) => void
  'room:clock': (acknowledge: (now: number) => void) => void
} & Record<GameAction, (command: RoomCommand, acknowledge: RoomAcknowledgement) => void>

export type RoomSocket = Socket<ServerEvents, ClientEvents>

const ACKNOWLEDGEMENT_TIMEOUT = 8_000
const CONNECTION_TIMEOUT = 12_000

export async function prepareGuestSession(signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/guest', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('The guest session could not be created. Please reconnect and try again.')
}

export function createRoomSocket(): RoomSocket {
  return io({ autoConnect: false, withCredentials: true })
}

export function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function waitForConnection(socket: RoomSocket, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('The connection was closed.'))
  if (socket.connected) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('connect', onConnect)
      signal.removeEventListener('abort', onAbort)
    }
    const onConnect = () => {
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(new Error('The connection was closed.'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('The server is not reachable.'))
    }, CONNECTION_TIMEOUT)
    socket.on('connect', onConnect)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function acknowledgement<T>(signal: AbortSignal, emit: (complete: (error: Error | null, response: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('The connection was closed.'))
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    emit((error, response) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return
      if (error) reject(error)
      else resolve(response)
    })
  })
}

async function requestWithRetry<T>(
  socket: RoomSocket,
  signal: AbortSignal,
  send: () => Promise<T>,
  onRetry?: () => void,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await waitForConnection(socket, signal)
      return await send()
    } catch (error) {
      if (signal.aborted || attempt === 1) throw error
      onRetry?.()
    }
  }
  throw new Error('The server did not confirm the request.')
}

/** Both attempts use the original command, including its idempotency key. */
export function sendRoomCommand(
  socket: RoomSocket,
  action: RoomAction,
  command: RoomCommand,
  signal: AbortSignal,
  onRetry?: () => void,
): Promise<RoomResponse> {
  return requestWithRetry(socket, signal, () => acknowledgement(signal, (complete) => {
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT).emit(action, command, complete)
  }), onRetry)
}

export function sendRoomPreview(socket: RoomSocket, code: string, signal: AbortSignal): Promise<RoomPreviewResponse> {
  return requestWithRetry(socket, signal, () => acknowledgement(signal, (complete) => {
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT).emit('room:preview', { code }, complete)
  }))
}

export function requestRoomTakeover(socket: RoomSocket, signal: AbortSignal): Promise<RoomResponse> {
  return requestWithRetry(socket, signal, () => acknowledgement(signal, (complete) => {
    socket.timeout(ACKNOWLEDGEMENT_TIMEOUT).emit('room:takeover', complete)
  }))
}
