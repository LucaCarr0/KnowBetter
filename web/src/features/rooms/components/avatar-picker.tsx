'use client'

import { useId } from 'react'
import { avatars, getAvatar, type AvatarId } from '../data/avatars'
import { PlayerAvatar } from './player-avatar'

export function AvatarPicker({ value, onChange, disabled = false }: {
  value: AvatarId
  onChange: (id: AvatarId) => void
  disabled?: boolean
}) {
  const groupId = useId()
  const selectedId = getAvatar(value).id

  return (
    <fieldset className="daisy-fieldset mb-7 gap-0 p-0" disabled={disabled}>
      <legend className="daisy-fieldset-legend mb-3 p-0 text-xs font-black uppercase tracking-[0.14em] text-base-content/60">Pick your avatar</legend>
      <div className="grid grid-cols-4 gap-2 min-[360px]:grid-cols-5 sm:grid-cols-6">
        {avatars.map((item) => (
          <div key={item.id} className="group relative aspect-square min-h-11">
            <input id={`${groupId}-${item.id}`} className="peer sr-only" type="radio" name={groupId} value={item.id} checked={selectedId === item.id} onChange={() => onChange(item.id)} aria-label={`${item.label} avatar`} />
            <PlayerAvatar avatarId={item.id} className={`size-full rounded-xl transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-base-content peer-checked:ring-2 peer-checked:ring-base-content peer-checked:ring-offset-2 peer-checked:ring-offset-base-100 peer-disabled:opacity-50 ${selectedId === item.id ? '' : 'opacity-70 group-hover:opacity-100'}`} />
            <label htmlFor={`${groupId}-${item.id}`} title={item.label} className="absolute inset-0 cursor-pointer rounded-xl peer-disabled:cursor-not-allowed"><span className="sr-only">{item.label}</span></label>
          </div>
        ))}
      </div>
    </fieldset>
  )
}
