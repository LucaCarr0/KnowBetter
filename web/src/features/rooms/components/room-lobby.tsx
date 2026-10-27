'use client'

import { Crown, LogOut, Pencil, Play, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_AVATAR_ID } from '../data/avatars'
import type { PlayerIdentity, RoomResponse, RoomSnapshot } from '../types'
import { validateIdentity } from '../lib/validation'
import { AvatarPicker } from './avatar-picker'
import { CopyInvite } from './copy-invite'
import { PlayerAvatar } from './player-avatar'

export function RoomLobby({ room, connected, onLeave, onUpdate, onStart }: {
  room: RoomSnapshot
  connected: boolean
  onLeave: () => Promise<RoomResponse>
  onUpdate: (identity: PlayerIdentity) => Promise<RoomResponse>
  onStart: () => Promise<RoomResponse>
}) {
  const self = room.members.find((member) => member.id === room.selfId)
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState(self?.nickname ?? '')
  const [avatarId, setAvatarId] = useState(self?.avatarId ?? DEFAULT_AVATAR_ID)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [invite, setInvite] = useState('')
  const connectedPlayers = room.members.filter(member => member.connected).length
  const isHost = room.hostId === room.selfId
  useEffect(() => { setInvite(`${window.location.origin}/?room=${room.code}#room-access`) }, [room.code])

  async function save(event: FormEvent) {
    event.preventDefault()
    const parsed = validateIdentity({ nickname, avatarId })
    if ('error' in parsed) { setMessage(parsed.error.message); return }
    setPending(true)
    const result = await onUpdate(parsed.identity)
    setPending(false)
    if (result.ok) { setEditing(false); setMessage('') }
    else setMessage(result.error.message)
  }

  async function leave() {
    setPending(true)
    const result = await onLeave()
    if (!result.ok) { setMessage(result.error.message); setPending(false) }
  }

  async function start() {
    setPending(true)
    setMessage('')
    const result = await onStart()
    if (!result.ok) setMessage(result.error.message)
    setPending(false)
  }

  return (
    <div className="rounded-[1.55rem] bg-[#f8f1e6] p-6 text-[#10142f] sm:p-8">
      <div className="mb-5 flex items-start justify-between gap-2">
        <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#777b96]">Your private room</p><h2 className="mt-1 text-2xl font-black tracking-tight">The crew is gathering.</h2></div>
        <Users className="mt-1 size-6 shrink-0 text-[#777b96]" aria-hidden="true" />
      </div>
      <div className="mb-4 rounded-xl bg-[#eae1d5] px-4 py-3">
        <p className="text-xs font-bold text-[#515570]">Room code</p>
        <p className="break-all font-mono text-3xl font-black tracking-[0.14em]" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</p>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2"><CopyInvite value={room.code} label="Copy code" />{invite && <CopyInvite value={invite} label="Copy invite link" />}</div>
      {invite && (
        <div className="daisy-card mb-6 bg-base-200 text-base-content">
          <div className="daisy-card-body items-center gap-3 p-4 text-center">
            <QRCodeSVG value={invite} size={192} level="M" marginSize={4} title={`Join room ${room.code}`} role="img" className="h-auto max-w-full rounded-lg" />
            <p className="text-sm font-black">Scan to join</p>
            <p className="text-xs leading-relaxed">Open your phone&apos;s camera and scan the QR code. Choose your nickname and avatar: the room code is already filled in.</p>
            {['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(new URL(invite).hostname) && (
              <p className="text-xs font-bold leading-relaxed">To invite other phones, first open this page using the computer&apos;s Wi-Fi address instead of localhost.</p>
            )}
          </div>
        </div>
      )}
      <p className="mb-3 text-xs font-bold text-[#515570]">{room.members.length} / 10 places occupied{room.members.some((member) => !member.connected) ? ' · includes reconnecting players' : ''}</p>
      <ul className="space-y-2" aria-label="Players in the room" aria-live="polite" aria-relevant="all">
        {room.members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 rounded-xl bg-white/65 px-3 py-2.5">
            <PlayerAvatar avatarId={member.avatarId} className="size-11" />
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-black">{member.nickname}{member.id === room.selfId && <span className="ml-1 text-xs font-medium text-[#515570]">(you)</span>}</p><p className="text-xs text-[#515570]">{member.connected ? 'Connected' : 'Reconnecting · place reserved'}</p></div>
            {member.id === room.hostId && <Crown className="size-4 shrink-0 text-[#956300]" aria-label="Room organizer" role="img" />}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-[#515570]">Your room is ready. Share your invite to bring the others in.</p>
      <link rel="preload" as="image" href="/hosts/jerry/jerry.webp" />
      <div className="mt-5 rounded-xl border-2 border-base-300 bg-base-100 p-4 text-base-content">
        <p className="mb-3 text-sm font-bold">{connectedPlayers < 2 ? 'Servono almeno 2 giocatori connessi per iniziare.' : isHost ? `${connectedPlayers} giocatori connessi. Jerry vi aspetta!` : 'Il gruppo è pronto. Aspettiamo il via dell’organizzatore.'}</p>
        {isHost && <button type="button" onClick={start} disabled={pending || !connected || connectedPlayers < 2 || editing} className="daisy-btn daisy-btn-primary min-h-12 w-full font-black"><Play className="size-4" aria-hidden="true" />{pending ? 'Preparazione…' : 'Inizia partita!'}</button>}
      </div>
      {message && <p role="alert" className="mt-3 text-sm font-semibold text-[#a42c3b]">{message}</p>}
      {editing && (
        <form onSubmit={save} className="mt-5 border-t border-[#d8cfc3] pt-5">
          <label htmlFor="edit-nickname" className="mb-2 block text-xs font-black uppercase tracking-wider text-[#515570]">Your nickname</label>
          <input id="edit-nickname" autoComplete="off" required value={nickname} onChange={(event) => setNickname(event.target.value)} disabled={pending || !connected} className="daisy-input mb-4 h-12 w-full rounded-xl border-2 border-[#d8cfc3] bg-white px-4 text-base font-bold text-[#10142f]" />
          <AvatarPicker value={avatarId} onChange={setAvatarId} disabled={pending || !connected} />
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={pending || !connected} className="daisy-btn border-0 bg-[#10142f] text-white">Save changes</button><button type="button" onClick={() => { setEditing(false); setMessage('') }} disabled={pending} className="daisy-btn border-[#d8cfc3] bg-transparent text-[#10142f] shadow-none">Cancel</button></div>
        </form>
      )}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-[#d8cfc3] pt-4">
        {!editing && <button type="button" disabled={pending || !connected} onClick={() => { setNickname(self?.nickname ?? ''); setAvatarId(self?.avatarId ?? DEFAULT_AVATAR_ID); setEditing(true); setMessage('') }} className="daisy-btn h-auto min-h-11 border-0 bg-transparent px-2 py-2 text-xs text-[#515570] shadow-none"><Pencil className="size-4" aria-hidden="true" /> Edit nickname / avatar</button>}
        <button type="button" disabled={pending || !connected} onClick={leave} className="daisy-btn ml-auto h-auto min-h-11 border-0 bg-transparent px-2 py-2 text-xs text-[#a42c3b] shadow-none"><LogOut className="size-4" aria-hidden="true" /> Leave room</button>
      </div>
    </div>
  )
}
