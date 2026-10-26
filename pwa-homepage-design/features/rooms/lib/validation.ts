import { normalizeAvatarId } from '../data/avatars'
import type { PlayerIdentity, RoomError } from '../types'

export const MAX_PLAYERS = 10
export const ROOM_CODE_LENGTH = 6
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeNickname(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

export function nicknameKey(value: string): string {
  return normalizeNickname(value).toLocaleLowerCase('en-US')
}

export function normalizeRoomCode(value: string): string {
  return value.replace(/\s+/gu, '').toUpperCase()
}

export function validateRoomCode(value: string): RoomError | null {
  const code = normalizeRoomCode(value)
  if (code.length !== ROOM_CODE_LENGTH || [...code].some((char) => !ROOM_CODE_ALPHABET.includes(char))) {
    return { code: 'INVALID_CODE', message: 'Enter the 6-character room code.', field: 'roomCode' }
  }
  return null
}

export function validateIdentity(value: unknown): { identity: PlayerIdentity } | { error: RoomError } {
  if (!value || typeof value !== 'object') {
    return { error: { code: 'INVALID_IDENTITY', message: 'Choose a nickname and an avatar.' } }
  }
  const { nickname, avatarId } = value as Record<string, unknown>
  if (typeof nickname !== 'string' || /[\p{Cc}\p{Cf}]/u.test(nickname)) {
    return { error: { code: 'INVALID_NICKNAME', message: 'Use a nickname without control characters.', field: 'nickname' } }
  }
  const normalized = normalizeNickname(nickname)
  const length = [...normalized].length
  if (length < 2 || length > 18) {
    return { error: { code: 'INVALID_NICKNAME', message: 'Your nickname must have 2–18 characters.', field: 'nickname' } }
  }
  const normalizedAvatarId = normalizeAvatarId(avatarId)
  if (!normalizedAvatarId) {
    return { error: { code: 'INVALID_AVATAR', message: 'Choose one of the available avatars.', field: 'avatarId' } }
  }
  return { identity: { nickname: normalized, avatarId: normalizedAvatarId } }
}
