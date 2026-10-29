'use client'

import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DEFAULT_AVATAR_ID, type AvatarId } from '../data/avatars'
import type { useRoomConnection } from '../hooks/use-room-connection'
import { normalizeRoomCode, validateIdentity, validateRoomCode } from '../lib/validation'
import type { PlayerIdentity, RoomError, RoomResponse } from '../types'
import { AvatarPicker } from './avatar-picker'
import { PlayerAvatar } from './player-avatar'
import { RoomLobby } from './room-lobby'
import { TEXTS } from '../../../texts'

const IDENTITY_STORAGE_KEY = 'kb-last-identity'

function rememberIdentity(identity: PlayerIdentity) {
  try {
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // Remembering a choice is optional when browser storage is unavailable.
  }
}

export function RoomAccessPanel({ connection }: { connection: ReturnType<typeof useRoomConnection> }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [avatarId, setAvatarId] = useState<AvatarId>(DEFAULT_AVATAR_ID)
  const [pending, setPending] = useState(false)
  const [takingControl, setTakingControl] = useState(false)
  const [formError, setFormError] = useState<RoomError | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    const invite = new URL(window.location.href).searchParams.get('room')
    if (invite !== null) {
      setMode('join')
      setRoomCode(normalizeRoomCode(invite))
    }
    try {
      const saved = window.localStorage.getItem(IDENTITY_STORAGE_KEY)
      if (saved) {
        const parsed = validateIdentity(JSON.parse(saved))
        if ('identity' in parsed) {
          setNickname(parsed.identity.nickname)
          setAvatarId(parsed.identity.avatarId)
        }
      }
    } catch {
      // The menu remains usable without saved preferences.
    }
    return () => { mountedRef.current = false }
  }, [])

  const connected = connection.status === 'connected'
  const uncertain = connection.error?.code === 'REQUEST_UNCERTAIN'
  const fieldsDisabled = pending || uncertain
  const visibleError = connection.error?.code === 'SESSION_EXPIRED' ? connection.error : formError ?? connection.error

  function clearErrors() {
    setFormError(null)
    connection.clearError()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !connected) return
    const identity = validateIdentity({ nickname, avatarId })
    if ('error' in identity) { setFormError(identity.error); return }
    const code = normalizeRoomCode(roomCode)
    if (mode === 'join') {
      const invalidCode = validateRoomCode(code)
      if (invalidCode) { setFormError(invalidCode); return }
    }

    setPending(true)
    setFormError(null)
    try {
      if (mode === 'join' && !uncertain) {
        const preview = await connection.preview(code)
        if (!mountedRef.current) return
        if (!preview.ok) { setFormError(preview.error); return }
      }
      const result = await connection.execute(mode === 'create' ? 'room:create' : 'room:join', {
        identity: identity.identity,
        ...(mode === 'join' ? { code } : {}),
      })
      if (!mountedRef.current) return
      if (result.ok) {
        rememberIdentity(identity.identity)
        setNickname(identity.identity.nickname)
        setRoomCode(code)
      } else setFormError(result.error)
    } finally {
      if (mountedRef.current) setPending(false)
    }
  }

  async function leave(): Promise<RoomResponse> {
    const result = await connection.execute('room:leave')
    if (result.ok && mountedRef.current) {
      const destination = new URL(window.location.href)
      destination.searchParams.delete('room')
      window.history.replaceState(window.history.state, '', destination)
      setRoomCode('')
      setMode('create')
      setFormError(null)
    }
    return result
  }

  async function updateIdentity(identity: PlayerIdentity): Promise<RoomResponse> {
    const parsed = validateIdentity(identity)
    if ('error' in parsed) return { ok: false, error: parsed.error }
    const result = await connection.execute('room:update', { identity: parsed.identity })
    if (result.ok && mountedRef.current) {
      rememberIdentity(parsed.identity)
      setNickname(parsed.identity.nickname)
      setAvatarId(parsed.identity.avatarId)
    }
    return result
  }

  async function takeControl() {
    if (takingControl) return
    setTakingControl(true)
    await connection.takeover()
    if (mountedRef.current) setTakingControl(false)
  }

  return (
    <div id="room-access" className="relative mx-auto w-full max-w-[480px] scroll-mt-6">
      <div aria-hidden="true" className="absolute -right-4 -top-8 hidden size-20 rotate-12 rounded-2xl border-2 border-[#ffd166] bg-[#ffd166] p-3 text-center text-[#10142f] shadow-[5px_5px_0_#10142f] sm:block">
        <div className="text-2xl font-black">10</div><div className="text-[9px] font-black uppercase leading-none">{TEXTS.access.stickerTop}<br />{TEXTS.access.stickerBottom}</div>
      </div>
      <div aria-hidden="true" className="absolute -bottom-8 -left-5 hidden -rotate-12 rounded-full border-2 border-[#b8e36d] bg-[#b8e36d] px-4 py-2 text-xs font-black text-[#10142f] shadow-[4px_4px_0_#10142f] sm:block">{TEXTS.access.stickerNoLogin}</div>
      <div className="daisy-card rounded-[2rem] border border-white/15 bg-[#1b2042] p-2 shadow-[0_24px_80px_rgba(0,0,0,.32)]">
        {connection.status !== 'connected' && (
          <div className="px-4 py-3 text-sm font-semibold text-[#fffaf3]" role="status" aria-live="polite">
            {connection.status === 'conflict' ? (
              <>
                <p>{TEXTS.access.conflict}</p>
                <button type="button" disabled={takingControl} onClick={takeControl} className="daisy-btn mt-2 min-h-11 border-0 bg-[#ffd166] text-[#10142f]">
                  {takingControl ? <span className="daisy-loading daisy-loading-spinner size-4" aria-hidden="true" /> : null}
                  {TEXTS.access.continueHere}
                </button>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2">
                  {connection.status !== 'offline' && <span className="daisy-loading daisy-loading-spinner size-4" aria-hidden="true" />}
                  {connection.status === 'connecting' ? TEXTS.access.connecting : connection.status === 'reconnecting' ? TEXTS.access.reconnecting : TEXTS.access.offline}
                </p>
                {connection.status === 'offline' && <button type="button" onClick={() => window.location.reload()} className="daisy-btn mt-2 min-h-11 border-white/20 bg-transparent text-[#fffaf3] shadow-none">{TEXTS.access.reconnect}</button>}
              </>
            )}
          </div>
        )}
        {connection.room ? (
          <RoomLobby room={connection.room} connected={connected} onLeave={leave} onUpdate={updateIdentity} onStart={() => connection.execute('game:start', { roomId: connection.room!.id })} />
        ) : (
          <form onSubmit={submit} noValidate aria-busy={pending} className="rounded-[1.55rem] bg-[#f8f1e6] p-6 text-[#10142f] sm:p-8">
            <div className="mb-7 flex items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#777b96]">{TEXTS.access.eyebrow}</p><h2 className="mt-1 text-2xl font-black tracking-tight">{TEXTS.access.title}</h2></div>
              <PlayerAvatar avatarId={avatarId} className="size-14" />
            </div>
            <div role="group" aria-label={TEXTS.access.actionGroupLabel} className="mb-6 grid grid-cols-2 rounded-xl bg-[#eae1d5] p-1 text-sm font-black">
              <button type="button" aria-pressed={mode === 'create'} disabled={fieldsDisabled} onClick={() => { setMode('create'); clearErrors() }} className={`daisy-btn h-auto min-h-11 rounded-lg border-0 px-3 py-2.5 shadow-none transition ${mode === 'create' ? 'bg-[#10142f] text-white shadow-sm' : 'bg-transparent text-[#777b96]'}`}>{TEXTS.access.createTab}</button>
              <button type="button" aria-pressed={mode === 'join'} disabled={fieldsDisabled} onClick={() => { setMode('join'); clearErrors() }} className={`daisy-btn h-auto min-h-11 rounded-lg border-0 px-3 py-2.5 shadow-none transition ${mode === 'join' ? 'bg-[#10142f] text-white shadow-sm' : 'bg-transparent text-[#777b96]'}`}>{TEXTS.access.joinTab}</button>
            </div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#777b96]" htmlFor="nickname">{TEXTS.access.nicknameLabel}</label>
            <input id="nickname" name="nickname" autoComplete="off" autoCapitalize="words" spellCheck={false} value={nickname} onChange={(event) => { setNickname(event.target.value); clearErrors() }} disabled={fieldsDisabled} placeholder={TEXTS.access.nicknamePlaceholder} aria-invalid={visibleError?.field === 'nickname'} aria-describedby={visibleError ? 'room-access-error' : undefined} className="daisy-input mb-5 h-auto min-h-12 w-full rounded-xl border-2 border-[#d8cfc3] bg-white px-4 py-3.5 text-base font-bold text-[#10142f] outline-none transition focus:border-[#ff7657]" />
            {mode === 'join' && (
              <>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-[#777b96]" htmlFor="room-code">{TEXTS.access.codeLabel}</label>
                <input id="room-code" name="roomCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={roomCode} onChange={(event) => { setRoomCode(normalizeRoomCode(event.target.value)); clearErrors() }} disabled={fieldsDisabled} placeholder={TEXTS.access.codePlaceholder} aria-invalid={visibleError?.field === 'roomCode'} aria-describedby={visibleError ? 'room-access-error' : undefined} className="daisy-input mb-5 h-auto min-h-12 w-full rounded-xl border-2 border-[#d8cfc3] bg-white px-4 py-3.5 text-base font-bold uppercase text-[#10142f] outline-none transition focus:border-[#ff7657]" />
              </>
            )}
            <AvatarPicker value={avatarId} onChange={(id) => { setAvatarId(id); clearErrors() }} disabled={fieldsDisabled} />
            {visibleError && <p id="room-access-error" role="alert" className="mb-4 text-sm font-semibold text-[#a42c3b]">{visibleError.message}</p>}
            <button type="submit" disabled={pending || !connected} className="daisy-btn flex h-auto min-h-13 w-full items-center justify-center gap-2 rounded-xl border-0 bg-[#ff7657] px-5 py-4 text-sm font-black text-[#10142f] shadow-[0_4px_0_#b74f47] transition hover:-translate-y-0.5 hover:bg-[#ff896b] active:translate-y-0.5 active:shadow-none">
              {pending ? <><span className="daisy-loading daisy-loading-spinner size-4" aria-hidden="true" /> {mode === 'create' ? TEXTS.access.creating : TEXTS.access.joining}</> : <>{uncertain ? TEXTS.access.checkLastAction : mode === 'create' ? TEXTS.access.submitCreate : TEXTS.access.submitJoin} <ArrowRight className="size-4" aria-hidden="true" /></>}
            </button>
            <p className="mt-4 text-center text-[11px] font-semibold text-[#777b96]">{TEXTS.access.footnote}</p>
          </form>
        )}
      </div>
    </div>
  )
}
