'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createRequestId,
  createRoomSocket,
  prepareGuestSession,
  requestRoomTakeover,
  sendRoomCommand,
  sendRoomPreview,
  type RoomPreviewResponse,
  type RoomSocket,
} from '../services/room-client'
import type { PlayerIdentity, RoomAction, RoomCommand, RoomError, RoomResponse, RoomSnapshot } from '../types'
import type { GameCommandFields } from '../../game/types'
import { normalizeNickname, normalizeRoomCode } from '../lib/validation'

export type RoomConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'conflict'

type RoomInput = { identity?: PlayerIdentity; code?: string } & GameCommandFields
type PendingCommand = {
  action: RoomAction
  fingerprint: string
  command: RoomCommand
  previousRoomId: string | null
  previousVersion: number
}

function confirmsCommand(operation: PendingCommand, snapshot: RoomSnapshot | null): boolean {
  if (operation.action === 'room:leave') return snapshot === null
  if (operation.action === 'room:resume') return true
  if (operation.action.startsWith('game:')) {
    if (!snapshot || snapshot.id !== operation.previousRoomId) return false
    const command = operation.command
    if (operation.action === 'game:start') return Boolean(snapshot.game && snapshot.status !== 'waiting' && snapshot.version > operation.previousVersion)
    if (operation.action === 'game:return-lobby') return snapshot.status === 'waiting' && !snapshot.game && snapshot.version > operation.previousVersion
    const game = snapshot.game
    if (!game || game.id !== command.matchId) return false
    if (operation.action === 'game:resume') return true
    if (operation.action === 'game:continue') return snapshot.version > operation.previousVersion && (game.round !== command.roundId || game.phase !== command.expectedPhase)
    if (operation.action === 'game:vote-category') return game.round === command.roundId && game.selfVote === command.categoryId
    if (operation.action === 'game:answer') return game.question?.instanceId === command.questionInstanceId && game.selfAnswer === command.optionId
    if (operation.action === 'game:use-power') return game.round === command.roundId && game.powers.used && !game.powers.inventory.some(card => card.id === command.powerCardId)
    if (operation.action === 'game:ready-question') return game.round === command.roundId && game.powers.ready
    if (operation.action === 'game:clear-power') return game.question?.instanceId === command.questionInstanceId && Boolean(command.optionId && game.powers.effect?.revealedOptionIds.includes(command.optionId))
    return false
  }
  if (!snapshot || !operation.command.identity) return false
  const self = snapshot.members.find((member) => member.id === snapshot.selfId)
  const identity = operation.command.identity
  if (self?.nickname !== normalizeNickname(identity.nickname) || self.avatarId !== identity.avatarId) return false
  if (operation.action === 'room:create') return snapshot.id !== operation.previousRoomId
  if (operation.action === 'room:join') {
    return snapshot.code === normalizeRoomCode(operation.command.code ?? '') &&
      (snapshot.id !== operation.previousRoomId || snapshot.version > operation.previousVersion)
  }
  return snapshot.id === operation.previousRoomId && snapshot.version > operation.previousVersion
}

const unavailableError: RoomError = {
  code: 'CONNECTION_UNAVAILABLE',
  message: 'The connection is not ready. Please wait or reconnect and try again.',
}
const uncertainError: RoomError = {
  code: 'REQUEST_UNCERTAIN',
  message: 'We could not confirm this action. Retry with the same details to check its result.',
}
const conflictError: RoomError = {
  code: 'CONTROL_REQUIRED',
  message: 'Another tab controls your player. Take control here to continue.',
}

export function useRoomConnection() {
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [status, setStatus] = useState<RoomConnectionStatus>('connecting')
  const [error, setError] = useState<RoomError | null>(null)
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number | undefined>()
  const socketRef = useRef<RoomSocket | null>(null)
  const lifecycleRef = useRef<AbortController | null>(null)
  const roomRef = useRef<RoomSnapshot | null>(null)
  const statusRef = useRef<RoomConnectionStatus>('connecting')
  const revisionRef = useRef(0)
  const pendingRef = useRef<PendingCommand | null>(null)
  const busyRef = useRef(false)
  const controlRevisionRef = useRef(0)

  const updateStatus = useCallback((next: RoomConnectionStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const applySnapshot = useCallback((snapshot: RoomSnapshot | null, requestRevision?: number) => {
    // A delayed acknowledgement must not undo a more recent event, including leaving a room.
    if (requestRevision !== undefined && requestRevision !== revisionRef.current) return
    const current = roomRef.current
    if (snapshot && current?.id === snapshot.id && snapshot.version < current.version) return
    if (JSON.stringify(snapshot) === JSON.stringify(current)) return
    roomRef.current = snapshot
    revisionRef.current += 1
    setRoom(snapshot)
    if (pendingRef.current && confirmsCommand(pendingRef.current, snapshot)) {
      pendingRef.current = null
      setError(null)
    }
  }, [])

  const applyFailure = useCallback((next: RoomError) => {
    setError(next)
    if (next.code === 'CONTROL_REQUIRED') {
      controlRevisionRef.current += 1
      updateStatus('conflict')
    }
  }, [updateStatus])

  useEffect(() => {
    const lifecycle = new AbortController()
    lifecycleRef.current = lifecycle
    let socket: RoomSocket | null = null
    let resumeGeneration = 0
    let initializing = false
    let sessionExpired = false
    let setupRetryTimer: ReturnType<typeof setTimeout> | undefined
    let clockTimer: ReturnType<typeof setInterval> | undefined

    const syncClock = () => {
      if (!socket?.connected || lifecycle.signal.aborted) return
      const startedAt = Date.now()
      socket.timeout(3000).emit('room:clock', (clockError: Error | null, serverNow: number) => {
        if (!clockError && !lifecycle.signal.aborted && Number.isFinite(serverNow)) setServerClockOffsetMs(serverNow - (startedAt + Date.now()) / 2)
      })
    }

    const resume = async () => {
      if (!socket || lifecycle.signal.aborted) return
      syncClock()
      const currentGeneration = ++resumeGeneration
      const requestRevision = revisionRef.current
      if (statusRef.current !== 'conflict') updateStatus('connecting')
      try {
        const response = await sendRoomCommand(socket, 'room:resume', { requestId: createRequestId() }, lifecycle.signal)
        if (lifecycle.signal.aborted || currentGeneration !== resumeGeneration) return
        if (response.ok) {
          applySnapshot(response.room, requestRevision)
          if (statusRef.current !== 'conflict') {
            updateStatus('connected')
            if (!pendingRef.current) setError(null)
          }
        } else {
          applyFailure(response.error)
          if (response.error.code !== 'CONTROL_REQUIRED') updateStatus('connected')
        }
      } catch {
        if (lifecycle.signal.aborted || currentGeneration !== resumeGeneration) return
        setError(unavailableError)
        if (statusRef.current !== 'conflict') updateStatus(navigator.onLine ? 'reconnecting' : 'offline')
      }
    }

    const connect = async () => {
      if (initializing || socket || lifecycle.signal.aborted) return
      initializing = true
      clearTimeout(setupRetryTimer)
      try {
        await prepareGuestSession(lifecycle.signal)
        if (lifecycle.signal.aborted) return
        socket = createRoomSocket()
        socketRef.current = socket
        socket.on('connect', resume)
        socket.on('room:state', (snapshot) => {
          if (!lifecycle.signal.aborted) applySnapshot(snapshot)
        })
        socket.on('session:conflict', () => {
          if (!lifecycle.signal.aborted) applyFailure(conflictError)
        })
        socket.on('disconnect', () => {
          if (!lifecycle.signal.aborted && !sessionExpired && statusRef.current !== 'conflict') {
            updateStatus(navigator.onLine ? 'reconnecting' : 'offline')
          }
        })
        socket.on('connect_error', (connectionError: Error & { data?: { code?: string } }) => {
          if (!lifecycle.signal.aborted && connectionError.data?.code === 'SESSION_EXPIRED') {
            sessionExpired = true
            resumeGeneration += 1
            lifecycle.abort()
            socket?.disconnect()
            pendingRef.current = null
            applySnapshot(null)
            updateStatus('offline')
            setError({ code: 'SESSION_EXPIRED', message: 'Your guest session expired. Reconnect to start a new session.' })
            return
          }
          if (!lifecycle.signal.aborted && statusRef.current !== 'conflict') {
            updateStatus(navigator.onLine ? 'reconnecting' : 'offline')
            setError(unavailableError)
          }
        })
        socket.connect()
        clockTimer = setInterval(syncClock, 30_000)
      } catch {
        if (lifecycle.signal.aborted) return
        updateStatus('offline')
        setError(unavailableError)
        setupRetryTimer = setTimeout(() => void connect(), 3_000)
      } finally {
        initializing = false
      }
    }

    const onOnline = () => {
      if (sessionExpired || statusRef.current === 'conflict') return
      updateStatus('reconnecting')
      if (socket) socket.connect()
      else void connect()
    }
    const onOffline = () => {
      if (statusRef.current !== 'conflict') updateStatus('offline')
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || lifecycle.signal.aborted) return
      syncClock()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    void connect()

    return () => {
      lifecycle.abort()
      clearTimeout(setupRetryTimer)
      clearInterval(clockTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      socket?.removeAllListeners()
      socket?.disconnect()
      if (socketRef.current === socket) socketRef.current = null
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null
    }
  }, [applyFailure, applySnapshot, updateStatus])

  const execute = useCallback(async (action: RoomAction, input: RoomInput = {}): Promise<RoomResponse> => {
    const socket = socketRef.current
    const lifecycle = lifecycleRef.current
    if (!socket || !lifecycle || lifecycle.signal.aborted) return { ok: false, error: unavailableError }
    if (statusRef.current === 'conflict') return { ok: false, error: conflictError }
    if (busyRef.current) return { ok: false, error: { code: 'REQUEST_PENDING', message: 'Please wait for the current action to finish.' } }

    const fingerprint = JSON.stringify(input)
    const pending = pendingRef.current
    if (pending && (pending.action !== action || pending.fingerprint !== fingerprint)) {
      // Settle an uncertain earlier action with its original key before accepting a new intent.
      busyRef.current = true
      const pendingRevision = revisionRef.current
      try {
        const settled = await sendRoomCommand(socket, pending.action, pending.command, lifecycle.signal)
        if (lifecycle.signal.aborted) return { ok: false, error: unavailableError }
        pendingRef.current = null
        if (settled.ok) applySnapshot(settled.room, pendingRevision)
        else if (settled.error.code === 'CONTROL_REQUIRED') {
          applyFailure(settled.error)
          return settled
        }
      } catch {
        if (lifecycle.signal.aborted) return { ok: false, error: unavailableError }
        if (pendingRef.current === pending) {
          if (!lifecycle.signal.aborted) applyFailure(uncertainError)
          return { ok: false, error: uncertainError }
        }
      } finally {
        busyRef.current = false
      }
    }
    const operation: PendingCommand = pendingRef.current ?? {
      action,
      fingerprint,
      command: { requestId: createRequestId(), ...input },
      previousRoomId: roomRef.current?.id ?? null,
      previousVersion: roomRef.current?.version ?? -1,
    }
    pendingRef.current = operation
    busyRef.current = true
    const requestRevision = revisionRef.current
    setError(null)

    try {
      const response = await sendRoomCommand(socket, action, operation.command, lifecycle.signal, () => {
        if (!lifecycle.signal.aborted && pendingRef.current === operation) setError({ code: 'REQUEST_RETRYING', message: 'Still waiting for confirmation. Retrying the same action safely…' })
      })
      if (lifecycle.signal.aborted) return response
      pendingRef.current = null
      if (response.ok) {
        applySnapshot(response.room, requestRevision)
        setError(null)
      } else applyFailure(response.error)
      return response
    } catch {
      if (lifecycle.signal.aborted) return { ok: false, error: unavailableError }
      if (!lifecycle.signal.aborted && pendingRef.current !== operation) {
        // The published room state already confirmed an action whose ack was lost.
        setError(null)
        return { ok: true, room: roomRef.current }
      }
      if (!lifecycle.signal.aborted) applyFailure(uncertainError)
      return { ok: false, error: uncertainError }
    } finally {
      busyRef.current = false
    }
  }, [applyFailure, applySnapshot])

  const preview = useCallback(async (code: string): Promise<RoomPreviewResponse> => {
    const socket = socketRef.current
    const lifecycle = lifecycleRef.current
    if (!socket || !lifecycle || lifecycle.signal.aborted) return { ok: false, error: unavailableError }
    try {
      return await sendRoomPreview(socket, code, lifecycle.signal)
    } catch {
      return { ok: false, error: unavailableError }
    }
  }, [])

  const takeover = useCallback(async (): Promise<RoomResponse> => {
    const socket = socketRef.current
    const lifecycle = lifecycleRef.current
    if (!socket || !lifecycle || lifecycle.signal.aborted) return { ok: false, error: unavailableError }
    const requestRevision = revisionRef.current
    const controlRevision = controlRevisionRef.current
    try {
      const response = await requestRoomTakeover(socket, lifecycle.signal)
      if (lifecycle.signal.aborted) return response
      if (response.ok) {
        applySnapshot(response.room, requestRevision)
        if (controlRevisionRef.current === controlRevision) {
          updateStatus('connected')
          setError(null)
        }
      } else applyFailure(response.error)
      return response
    } catch {
      if (!lifecycle.signal.aborted) applyFailure(unavailableError)
      return { ok: false, error: unavailableError }
    }
  }, [applyFailure, applySnapshot, updateStatus])

  const clearError = useCallback(() => setError(null), [])

  return { room, status, error, execute, preview, takeover, clearError, serverClockOffsetMs }
}
