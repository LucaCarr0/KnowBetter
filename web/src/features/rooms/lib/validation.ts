import { normalizeAvatarId } from '../data/avatars'
import type { PlayerIdentity, RoomError } from '../types'
import { TEXTS } from '../../../texts'

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
    return { code: 'INVALID_CODE', message: TEXTS.errors.invalidCode, field: 'roomCode' }
  }
  return null
}

export function validateIdentity(value: unknown): { identity: PlayerIdentity } | { error: RoomError } {
  if (!value || typeof value !== 'object') {
    return { error: { code: 'INVALID_IDENTITY', message: TEXTS.errors.invalidIdentity } }
  }
  const { nickname, avatarId } = value as Record<string, unknown>
  if (typeof nickname !== 'string' || /[\p{Cc}\p{Cf}]/u.test(nickname)) {
    return { error: { code: 'INVALID_NICKNAME', message: TEXTS.errors.nicknameControlChars, field: 'nickname' } }
  }
  const normalized = normalizeNickname(nickname)
  const length = [...normalized].length
  if (length < 2 || length > 18) {
    return { error: { code: 'INVALID_NICKNAME', message: TEXTS.errors.nicknameLength, field: 'nickname' } }
  }
  const normalizedAvatarId = normalizeAvatarId(avatarId)
  if (!normalizedAvatarId) {
    return { error: { code: 'INVALID_AVATAR', message: TEXTS.errors.invalidAvatar, field: 'avatarId' } }
  }
  return { identity: { nickname: normalized, avatarId: normalizedAvatarId } }
}
