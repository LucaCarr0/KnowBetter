import type { AvatarId } from './data/avatars'
import type { GameAction, GameCommandFields, GameSnapshot } from '../game/types'

export interface PlayerIdentity {
  nickname: string
  avatarId: AvatarId
}

export interface RoomMember extends PlayerIdentity {
  id: string
  connected: boolean
  joinedAt: string
  reservedUntil: string | null
}

export interface RoomSnapshot {
  id: string
  code: string
  status: 'waiting' | 'starting' | 'playing' | 'closed'
  version: number
  hostId: string | null
  selfId: string
  expiresAt: string
  members: RoomMember[]
  game?: GameSnapshot | null
}

export interface RoomError {
  code: string
  message: string
  field?: 'nickname' | 'roomCode' | 'avatarId'
}

export type RoomResponse =
  | { ok: true; room: RoomSnapshot | null }
  | { ok: false; error: RoomError }

export interface RoomCommand extends GameCommandFields {
  requestId: string
  identity?: PlayerIdentity
  code?: string
}

export type RoomAction = 'room:create' | 'room:join' | 'room:resume' | 'room:update' | 'room:leave' | GameAction

export interface RoomPreview {
  code: string
  memberCount: number
  maxPlayers: number
}
