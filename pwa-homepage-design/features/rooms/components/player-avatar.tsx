import Image from 'next/image'
import { getAvatar } from '../data/avatars'

export function PlayerAvatar({ avatarId, className = '' }: {
  avatarId: string
  className?: string
}) {
  const avatar = getAvatar(avatarId)

  return (
    <div className={`daisy-avatar shrink-0 ${className}`} aria-hidden="true">
      <div className="size-full rounded-xl bg-base-200 p-1.5">
        <Image src={avatar.src} alt="" width={96} height={96} unoptimized draggable={false} className="size-full object-contain" />
      </div>
    </div>
  )
}
