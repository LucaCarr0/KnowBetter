'use client'

import type { ReactNode } from 'react'
import { GameStage } from '../game/components/game-stage'
import { useRoomConnection } from '../rooms/hooks/use-room-connection'
import { RoomAccessPanel } from '../rooms/components/room-access-panel'

export function SessionShell({ header, intro, phases, footer }: { header: ReactNode; intro: ReactNode; phases: ReactNode; footer: ReactNode }) {
  const connection = useRoomConnection()
  const room = connection.room
  if (room?.game && room.game.phase !== 'countdown') {
    return <GameStage game={room.game} selfId={room.selfId} roomCode={room.code} isHost={room.hostId === room.selfId}
      connected={connection.status === 'connected'} serverClockOffsetMs={connection.serverClockOffsetMs}
      controlConflict={connection.status === 'conflict'} onTakeControl={connection.takeover}
      onCommand={(action, input) => connection.execute(action, { matchId: room.game!.id, ...input })}
      onLeave={async () => {
        const result = await connection.execute('room:leave')
        if (result.ok) {
          const destination = new URL(window.location.href)
          destination.searchParams.delete('room')
          window.history.replaceState(window.history.state, '', destination)
        }
        return result
      }} />
  }
  return <main className="min-h-screen overflow-hidden bg-[#10142f] text-[#fffaf3]">
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 sm:px-8 lg:px-12">
      {header}
      <section id="top" className="grid flex-1 items-center gap-12 pb-14 pt-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-20 lg:pb-24 lg:pt-12">
        {intro}<RoomAccessPanel connection={connection} />
      </section>
      {phases}{footer}
    </div>
  </main>
}
