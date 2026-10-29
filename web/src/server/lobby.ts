import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getAvatar } from '../features/rooms/data/avatars'
import {
  MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, nicknameKey,
  normalizeRoomCode, validateIdentity, validateRoomCode,
} from '../features/rooms/lib/validation'
import type { PlayerIdentity, RoomAction, RoomCommand, RoomError, RoomPreview, RoomResponse, RoomSnapshot } from '../features/rooms/types'
import type { LobbyDatabase, Queryable } from './database'
import type { GameConfig } from '../features/game/types'
import { createGame, continueGame, vote, answer, bonusAnswer, usePower, readyQuestion, clearPower, advance, snapshot as gameSnapshot, recoverGame, retire, GameRuleError, type GameContent, type GameState } from './game/engine'
import { TEXTS } from '../texts'

interface GuestRow extends Record<string, unknown> { id: string; expires_at: number | string }
interface RoomRow extends Record<string, unknown> {
  id: string; code: string; status: RoomSnapshot['status']; host_id: string | null; version: number; expires_at: number | string
}
interface MemberRow extends Record<string, unknown> {
  id: string; room_id: string; guest_id: string; nickname: string; nickname_key: string; avatar_id: string
  joined_at: number | string; reserved_until: number | string | null; active: boolean
}
interface ReceiptRow extends Record<string, unknown> {
  action: string; fingerprint: string; result: RoomResponse; membership_id: string | null
}

export interface Connection { guestId: string; socketId: string }
export interface LobbyOptions { guestTtlMs?: number; reservationMs?: number; roomTtlMs?: number; now?: () => number; gameContent?: GameContent; gameConfig?: Partial<GameConfig> }
export type PreviewResponse = { ok: true; preview: RoomPreview } | { ok: false; error: RoomError }

function fail(code: string, message: string, field?: RoomError['field']): RoomResponse & { ok: false } {
  return { ok: false, error: { code, message, ...(field ? { field } : {}) } }
}
const expiredSession = () => fail('SESSION_EXPIRED', TEXTS.errors.sessionExpired)
const controlRequired = () => fail('CONTROL_REQUIRED', TEXTS.errors.controlRequired)
const roomMissing = () => fail('ROOM_NOT_FOUND', TEXTS.errors.roomMissing, 'roomCode')
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const iso = (value: number | string) => new Date(Number(value)).toISOString()

/** The server owns identity, capacity, presence and room state. No client can
 * select a guest or membership identifier. Every mutation is committed before
 * its acknowledgement, including a receipt for safe retries. */
export class LobbyService extends EventEmitter {
  private readonly controllers = new Map<string, string>()
  private readonly now: () => number
  private readonly guestTtlMs: number
  private readonly reservationMs: number
  private readonly roomTtlMs: number
  private tail = Promise.resolve()
  private readonly content: GameContent
  private readonly gameConfig: Partial<GameConfig>

  constructor(readonly database: LobbyDatabase, options: LobbyOptions = {}) {
    super()
    this.now = options.now ?? Date.now
    this.guestTtlMs = options.guestTtlMs ?? 24 * 60 * 60_000
    this.reservationMs = options.reservationMs ?? 90_000
    this.roomTtlMs = options.roomTtlMs ?? 60 * 60_000
    this.content = options.gameContent ?? { categories: [], questions: [] }
    this.gameConfig = options.gameConfig ?? {}
  }

  // Serialize memory ownership alongside database state; SQL transactions also
  // acquire a database lock, preventing capacity and identity races.
  private exclusive<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => this.database.transaction(work))
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  async initialize(): Promise<void> {
    await this.exclusive(async (db) => {
      await this.cleanup(db)
      const affected = await db.query<{ room_id: string }>(
        'UPDATE kb_members SET reserved_until = $1 WHERE active AND reserved_until IS NULL RETURNING room_id',
        [this.now() + this.reservationMs],
      )
      for (const roomId of new Set(affected.rows.map((member) => member.room_id))) await this.bump(db, roomId)
      const matches = await db.query<{ room_id: string; state: GameState }>('SELECT room_id,state FROM kb_matches WHERE active')
      for (const row of matches.rows) {
        if (recoverGame(row.state, this.now())) await this.saveGame(db, row.room_id, row.state)
      }
    })
  }

  async guest(token?: string): Promise<{ guestId: string; token: string; expiresAt: number; minted: boolean }> {
    return this.exclusive(async (db) => {
      if (token && /^[a-f0-9]{64}$/.test(token)) {
        const result = await db.query<GuestRow>('SELECT id, expires_at FROM kb_guests WHERE token_hash = $1 AND expires_at > $2', [tokenHash(token), this.now()])
        const guest = result.rows[0]
        if (guest) return { guestId: guest.id, token, expiresAt: Number(guest.expires_at), minted: false }
      }
      const secret = randomBytes(32).toString('hex')
      const guestId = randomUUID()
      const expiresAt = this.now() + this.guestTtlMs
      await db.query('INSERT INTO kb_guests(id, token_hash, created_at, expires_at) VALUES ($1,$2,$3,$4)', [guestId, tokenHash(secret), this.now(), expiresAt])
      return { guestId, token: secret, expiresAt, minted: true }
    })
  }

  async authenticate(token: string | undefined): Promise<string | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
    return this.exclusive(async (db) => {
      const result = await db.query<GuestRow>('SELECT id, expires_at FROM kb_guests WHERE token_hash = $1 AND expires_at > $2', [tokenHash(token), this.now()])
      return result.rows[0]?.id ?? null
    })
  }

  async connect(connection: Connection): Promise<boolean> {
    return this.exclusive(async (db) => {
      if (!(await this.validGuest(db, connection.guestId))) return false
      const owner = this.controllers.get(connection.guestId)
      if (owner && owner !== connection.socketId) return false
      this.controllers.set(connection.guestId, connection.socketId)
      return true
    })
  }

  async takeover(connection: Connection): Promise<{ response: RoomResponse; previousSocketId?: string }> {
    const result = await this.exclusive(async (db) => {
      if (!(await this.validGuest(db, connection.guestId))) return { response: expiredSession() }
      await this.cleanup(db)
      const previousSocketId = this.controllers.get(connection.guestId)
      this.controllers.set(connection.guestId, connection.socketId)
      const member = await this.activeMember(db, connection.guestId)
      if (member) await this.restore(db, member)
      return { response: { ok: true, room: member ? await this.snapshot(db, member) : null } as RoomResponse, previousSocketId }
    })
    this.emit('change')
    return result
  }

  async disconnect(connection: Connection): Promise<void> {
    await this.exclusive(async (db) => {
      // A delayed close from a previous transport cannot disconnect its replacement.
      if (this.controllers.get(connection.guestId) !== connection.socketId) return
      this.controllers.delete(connection.guestId)
      await this.cleanup(db)
      const member = await this.activeMember(db, connection.guestId)
      if (!member || member.reserved_until !== null) return
      await db.query('UPDATE kb_members SET reserved_until = $1 WHERE id = $2 AND active', [this.now() + this.reservationMs, member.id])
      const game = await this.gameForRoom(db, member.room_id)
      if (game && advance(game, this.content, await this.connectedIds(db, member.room_id), this.now())) await this.saveGame(db, member.room_id, game)
      await this.bump(db, member.room_id)
    })
    this.emit('change')
  }

  async command(connection: Connection, action: RoomAction, input: unknown, receivedAt = this.now()): Promise<RoomResponse> {
    const result = await this.exclusive(async (db) => {
      if (!(await this.validGuest(db, connection.guestId))) return expiredSession()
      if (this.controllers.get(connection.guestId) !== connection.socketId) return controlRequired()
      await this.cleanup(db)
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_REQUEST', TEXTS.errors.invalidRequest)
      const command = input as RoomCommand
      if (typeof command.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(command.requestId)) {
        return fail('INVALID_REQUEST', TEXTS.errors.requestIdRequired)
      }
      const identityInput = command.identity && typeof command.identity === 'object' ? command.identity : undefined
      const fingerprint = createHash('sha256').update(JSON.stringify({
        action, code: command.code, roomId: command.roomId, matchId: command.matchId,
        roundId: command.roundId, questionInstanceId: command.questionInstanceId, categoryId: command.categoryId, optionId: command.optionId,
        ...(command.bonusRunId !== undefined ? { bonusRunId: command.bonusRunId } : {}),
        ...(command.expectedPhase !== undefined ? { expectedPhase: command.expectedPhase } : {}),
        powerCardId: command.powerCardId, targetId: command.targetId, powerStep: command.powerStep,
        identity: identityInput ? { nickname: identityInput.nickname, avatarId: identityInput.avatarId } : command.identity,
      })).digest('hex')
      const previous = (await db.query<ReceiptRow>(
        'SELECT action, fingerprint, result, membership_id FROM kb_receipts WHERE guest_id = $1 AND request_id = $2',
        [connection.guestId, command.requestId],
      )).rows[0]
      if (previous) {
        if (previous.action !== action || previous.fingerprint !== fingerprint) return fail('REQUEST_REUSED', TEXTS.errors.requestReused)
        if (!previous.result.ok) return previous.result
        const member = previous.membership_id ? (await db.query<MemberRow>(
          'SELECT * FROM kb_members WHERE id = $1 AND guest_id = $2 AND active', [previous.membership_id, connection.guestId],
        )).rows[0] : undefined
        if (member) await this.restore(db, member)
        return { ok: true, room: member ? await this.snapshot(db, member) : null } as RoomResponse
      }

      let response: RoomResponse
      try { response = await this.execute(db, connection.guestId, action, command, receivedAt) }
      catch (error) {
        if (!(error instanceof GameRuleError)) throw error
        response = fail(error.code, error.message)
      }
      const membershipId = response.ok ? response.room?.selfId ?? null : null
      await db.query(
        'INSERT INTO kb_receipts(guest_id, request_id, action, fingerprint, result, membership_id, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)',
        [connection.guestId, command.requestId, action, fingerprint, JSON.stringify(response), membershipId, this.now()],
      )
      return response
    })
    this.emit('change')
    return result
  }

  async preview(guestId: string, input: unknown): Promise<PreviewResponse> {
    return this.exclusive(async (db) => {
      if (!(await this.validGuest(db, guestId))) return expiredSession()
      await this.cleanup(db)
      const value = input && typeof input === 'object' ? (input as { code?: unknown }).code : undefined
      if (typeof value !== 'string') return { ok: false, error: { code: 'INVALID_CODE', message: TEXTS.errors.invalidCode, field: 'roomCode' } }
      const error = validateRoomCode(value)
      if (error) return { ok: false, error }
      const room = await this.roomByCode(db, normalizeRoomCode(value))
      if (!room || room.status === 'closed') return roomMissing()
      if (room.status !== 'waiting') return fail('GAME_STARTED', TEXTS.errors.gameStartedJoin, 'roomCode')
      const members = await this.members(db, room.id)
      return { ok: true, preview: { code: room.code, memberCount: members.length, maxPlayers: MAX_PLAYERS } }
    })
  }

  async snapshots(guestIds: string[]): Promise<Map<string, RoomSnapshot | null>> {
    return this.exclusive(async (db) => {
      const result = new Map<string, RoomSnapshot | null>()
      for (const guestId of guestIds) {
        const member = await this.activeMember(db, guestId)
        result.set(guestId, member ? await this.snapshot(db, member) : null)
      }
      return result
    })
  }

  async sweep(): Promise<void> {
    const changed = await this.exclusive(async (db) => {
      const before = (await db.query<{ version: string }>('SELECT coalesce(sum(version),0)::text AS version FROM kb_rooms')).rows[0].version
      await this.cleanup(db)
      const matches = await db.query<{ room_id: string; state: GameState }>('SELECT room_id,state FROM kb_matches WHERE active')
      for (const row of matches.rows) {
        await this.reconcileRoom(db, row.room_id)
        if (advance(row.state, this.content, await this.connectedIds(db, row.room_id), this.now())) await this.saveGame(db, row.room_id, row.state)
      }
      const after = (await db.query<{ version: string }>('SELECT coalesce(sum(version),0)::text AS version FROM kb_rooms')).rows[0].version
      return before !== after
    })
    if (changed) this.emit('change')
  }

  async drain(): Promise<void> { await this.tail }

  private async connectedIds(db: Queryable, roomId: string): Promise<Set<string>> {
    const members = await this.members(db, roomId)
    return new Set(members.filter(member => member.reserved_until === null && this.controllers.has(member.guest_id)).map(member => member.id))
  }

  private async gameForRoom(db: Queryable, roomId: string): Promise<GameState | undefined> {
    return (await db.query<{ state: GameState }>('SELECT state FROM kb_matches WHERE room_id=$1 AND active', [roomId])).rows[0]?.state
  }

  private async publicGame(db: Queryable, roomId: string, selfId: string) {
    const game = await this.gameForRoom(db, roomId)
    return game?.players.some(player => player.id === selfId) ? gameSnapshot(game, selfId, await this.connectedIds(db, roomId), this.now()) : null
  }

  private async saveGame(db: Queryable, roomId: string, game: GameState): Promise<void> {
    const cancelled = game.phase === 'aborted' && game.round === 0
    await db.query('UPDATE kb_matches SET state=$1::jsonb,updated_at=$2,active=$3 WHERE id=$4', [JSON.stringify(game), this.now(), !cancelled, game.id])
    await db.query('UPDATE kb_rooms SET status=$1,version=version+1,expires_at=$2 WHERE id=$3', [cancelled ? 'waiting' : game.phase === 'countdown' ? 'starting' : 'playing', this.now() + this.roomTtlMs, roomId])
    if (cancelled) await this.reconcileRoom(db, roomId)
  }

  private async gameCommand(db: Queryable, member: MemberRow | undefined, action: RoomAction, command: RoomCommand, receivedAt: number): Promise<RoomResponse> {
    if (!member) return fail('NOT_IN_ROOM', TEXTS.errors.notInRoomPlay)
    const room = (await db.query<RoomRow>('SELECT * FROM kb_rooms WHERE id=$1', [member.room_id])).rows[0]
    if (!room || room.status === 'closed') return roomMissing()
    if (action === 'game:start') {
      if (command.roomId !== room.id) return fail('STALE_ROOM', TEXTS.errors.staleRoom)
      if (room.host_id !== member.id) return fail('HOST_REQUIRED', TEXTS.errors.hostRequiredStart)
      if (room.status !== 'waiting') return fail('GAME_STARTED', TEXTS.errors.gameStarted)
      const connected = await this.connectedIds(db, room.id)
      const members = await this.members(db, room.id)
      const roster = members.filter(entry => connected.has(entry.id)).map(entry => ({ id: entry.id, nickname: entry.nickname, avatarId: getAvatar(entry.avatar_id).id }))
      const game = createGame(roster, this.content, receivedAt, this.gameConfig)
      await db.query('INSERT INTO kb_matches(id,room_id,state,created_at,updated_at) VALUES($1,$2,$3::jsonb,$4,$4)', [game.id, room.id, JSON.stringify(game), this.now()])
      // Only the connected roster joins the match. Offline lobby reservations
      // cannot join a round retroactively or hold an unplayable active slot.
      for (const excluded of members.filter(entry => !connected.has(entry.id))) await db.query('UPDATE kb_members SET active=false,reserved_until=NULL WHERE id=$1', [excluded.id])
      await this.saveGame(db, room.id, game)
      return { ok: true, room: await this.snapshot(db, member) }
    }
    const game = await this.gameForRoom(db, room.id)
    if (!game || !game.players.some(player => player.id === member.id && !player.retired)) return fail('NOT_IN_GAME', TEXTS.errors.notInGame)
    if (command.matchId !== game.id) return fail('STALE_GAME', TEXTS.errors.staleGame)
    if (action === 'game:return-lobby') {
      if (room.host_id !== member.id) return fail('HOST_REQUIRED', TEXTS.errors.hostRequiredReturn)
      if (!['phase_complete', 'aborted'].includes(game.phase)) return fail('GAME_NOT_FINISHED', TEXTS.errors.gameNotFinished)
      await db.query('UPDATE kb_matches SET active=false WHERE id=$1', [game.id])
      await db.query("UPDATE kb_rooms SET status='waiting',version=version+1,expires_at=$1 WHERE id=$2", [this.now() + this.roomTtlMs, room.id])
      await this.reconcileRoom(db, room.id)
      return { ok: true, room: await this.snapshot(db, member) }
    }
    if (action === 'game:resume') {
      await this.restore(db, member)
      return { ok: true, room: await this.snapshot(db, member) }
    }
    if (command.roundId !== game.round) return fail('STALE_ROUND', TEXTS.errors.staleRound)
    if (action === 'game:continue') {
      if (!['intro', 'round_ready', 'bonus_intro', 'bonus_results'].includes(command.expectedPhase ?? '')) return fail('INVALID_REQUEST', TEXTS.errors.missingPhase)
      continueGame(game, member.id, this.content, await this.connectedIds(db, room.id), command.roundId, command.expectedPhase!, receivedAt)
    } else if (action === 'game:vote-category') {
      if (typeof command.categoryId !== 'string' || command.categoryId.length > 100) return fail('INVALID_CATEGORY', TEXTS.errors.invalidCategory)
      vote(game, member.id, command.categoryId, receivedAt)
    } else if (action === 'game:answer') {
      if (typeof command.optionId !== 'string' || command.optionId.length > 100 || typeof command.questionInstanceId !== 'string' || command.questionInstanceId.length > 100) return fail('INVALID_OPTION', TEXTS.errors.invalidOption)
      answer(game, member.id, command.optionId, command.questionInstanceId, receivedAt)
    } else if (action === 'game:bonus-answer') {
      if (advance(game, this.content, await this.connectedIds(db, room.id), receivedAt)) await this.saveGame(db, room.id, game)
      if (typeof command.optionId !== 'string' || !command.optionId.length || command.optionId.length > 100
        || typeof command.questionInstanceId !== 'string' || !command.questionInstanceId.length || command.questionInstanceId.length > 100
        || typeof command.bonusRunId !== 'string' || !command.bonusRunId.length || command.bonusRunId.length > 100) return fail('INVALID_REQUEST', TEXTS.errors.invalidBonusRequest)
      bonusAnswer(game, member.id, command.optionId, command.questionInstanceId, command.bonusRunId, receivedAt)
    } else if (action === 'game:use-power' || action === 'game:ready-question' || action === 'game:clear-power') {
      if (typeof command.questionInstanceId !== 'string' || command.questionInstanceId.length > 100) return fail('INVALID_REQUEST', TEXTS.errors.missingQuestion)
      if (action === 'game:use-power') {
        if (typeof command.powerCardId !== 'string' || command.powerCardId.length > 100 || typeof command.targetId !== 'string' || command.targetId.length > 100) return fail('INVALID_REQUEST', TEXTS.errors.missingPower)
        usePower(game, member.id, command.powerCardId, command.targetId, command.questionInstanceId, await this.connectedIds(db, room.id), receivedAt)
      } else if (action === 'game:ready-question') readyQuestion(game, member.id, command.questionInstanceId, receivedAt)
      else {
        if (command.optionId !== undefined && (typeof command.optionId !== 'string' || command.optionId.length > 100)
          || command.powerStep !== undefined) return fail('INVALID_REQUEST', TEXTS.errors.invalidObstacle)
        clearPower(game, member.id, command.questionInstanceId, command.optionId, receivedAt)
      }
    } else return fail('INVALID_REQUEST', TEXTS.errors.unknownGameAction)
    advance(game, this.content, await this.connectedIds(db, room.id), this.now())
    await this.saveGame(db, room.id, game)
    return { ok: true, room: await this.snapshot(db, member) }
  }

  private async execute(db: Queryable, guestId: string, action: RoomAction, command: RoomCommand, receivedAt: number): Promise<RoomResponse> {
    const existing = await this.activeMember(db, guestId)
    if (action === 'room:resume') {
      if (existing) await this.restore(db, existing)
      return { ok: true, room: existing ? await this.snapshot(db, existing) : null }
    }
    if (action === 'room:leave') {
      if (existing) {
        const game = await this.gameForRoom(db, existing.room_id)
        if (game) {
          retire(game, existing.id, receivedAt)
          advance(game, this.content, await this.connectedIds(db, existing.room_id), this.now())
          await this.saveGame(db, existing.room_id, game)
        }
        await db.query('UPDATE kb_members SET active = false, reserved_until = NULL WHERE id = $1', [existing.id])
        await this.reconcileRoom(db, existing.room_id)
        await this.bump(db, existing.room_id, true)
      }
      return { ok: true, room: null }
    }
    if (action.startsWith('game:')) return this.gameCommand(db, existing, action, command, receivedAt)
    const parsed = validateIdentity(command.identity)
    if ('error' in parsed) return { ok: false, error: parsed.error }
    const identity = parsed.identity

    if (action === 'room:update') {
      if (!existing) return fail('NOT_IN_ROOM', TEXTS.errors.notInRoomEdit)
      const currentRoom = (await db.query<RoomRow>('SELECT * FROM kb_rooms WHERE id=$1', [existing.room_id])).rows[0]
      if (currentRoom?.status !== 'waiting') return fail('GAME_STARTED', TEXTS.errors.editOnlyInLobby)
      if (await this.nicknameTaken(db, existing.room_id, identity.nickname, existing.id)) return fail('NICKNAME_TAKEN', TEXTS.errors.nicknameTaken, 'nickname')
      await db.query('UPDATE kb_members SET nickname = $1, nickname_key = $2, avatar_id = $3 WHERE id = $4', [identity.nickname, nicknameKey(identity.nickname), identity.avatarId, existing.id])
      await this.restore(db, existing)
      await this.bump(db, existing.room_id, true)
      return { ok: true, room: await this.snapshot(db, existing) }
    }
    if (existing) return fail('ALREADY_IN_ROOM', TEXTS.errors.alreadyInRoom)
    if (action === 'room:create') {
      let code: string
      do {
        code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('')
      } while (await this.roomByCode(db, code))
      const roomId = randomUUID()
      const memberId = randomUUID()
      await db.query('INSERT INTO kb_rooms(id, code, status, host_id, version, expires_at) VALUES ($1,$2,$3,$4,1,$5)', [roomId, code, 'waiting', memberId, this.now() + this.roomTtlMs])
      const member = await this.insertMember(db, guestId, roomId, identity, memberId)
      return { ok: true, room: await this.snapshot(db, member) }
    }
    if (action === 'room:join') {
      if (typeof command.code !== 'string') return fail('INVALID_CODE', TEXTS.errors.invalidCode, 'roomCode')
      const error = validateRoomCode(command.code)
      if (error) return { ok: false, error }
      const room = await this.roomByCode(db, normalizeRoomCode(command.code))
      if (!room || room.status === 'closed') return roomMissing()
      if (room.status !== 'waiting') return fail('GAME_STARTED', TEXTS.errors.gameStartedJoin, 'roomCode')
      const members = await this.members(db, room.id)
      if (members.length >= MAX_PLAYERS) return fail('ROOM_FULL', TEXTS.errors.roomFull, 'roomCode')
      if (await this.nicknameTaken(db, room.id, identity.nickname)) return fail('NICKNAME_TAKEN', TEXTS.errors.nicknameTaken, 'nickname')
      const member = await this.insertMember(db, guestId, room.id, identity)
      await this.reconcileRoom(db, room.id)
      await this.bump(db, room.id, true)
      return { ok: true, room: await this.snapshot(db, member) }
    }
    return fail('INVALID_REQUEST', TEXTS.errors.unknownRoomAction)
  }

  private async validGuest(db: Queryable, guestId: string): Promise<boolean> {
    return Boolean((await db.query<GuestRow>('SELECT id, expires_at FROM kb_guests WHERE id = $1 AND expires_at > $2', [guestId, this.now()])).rows[0])
  }
  private async activeMember(db: Queryable, guestId: string): Promise<MemberRow | undefined> {
    return (await db.query<MemberRow>('SELECT * FROM kb_members WHERE guest_id = $1 AND active', [guestId])).rows[0]
  }
  private async members(db: Queryable, roomId: string): Promise<MemberRow[]> {
    return (await db.query<MemberRow>('SELECT * FROM kb_members WHERE room_id = $1 AND active ORDER BY joined_at, id', [roomId])).rows
  }
  private async roomByCode(db: Queryable, code: string): Promise<RoomRow | undefined> {
    return (await db.query<RoomRow>('SELECT * FROM kb_rooms WHERE code = $1', [code])).rows[0]
  }
  private async nicknameTaken(db: Queryable, roomId: string, nickname: string, exceptId = ''): Promise<boolean> {
    return Boolean((await db.query('SELECT id FROM kb_members WHERE room_id = $1 AND nickname_key = $2 AND active AND id <> $3', [roomId, nicknameKey(nickname), exceptId])).rows[0])
  }
  private async insertMember(db: Queryable, guestId: string, roomId: string, identity: PlayerIdentity, id = randomUUID()): Promise<MemberRow> {
    const result = await db.query<MemberRow>(
      'INSERT INTO kb_members(id, room_id, guest_id, nickname, nickname_key, avatar_id, joined_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [id, roomId, guestId, identity.nickname, nicknameKey(identity.nickname), identity.avatarId, this.now()],
    )
    return result.rows[0]
  }
  private async restore(db: Queryable, member: MemberRow): Promise<void> {
    if (member.reserved_until !== null) {
      await db.query('UPDATE kb_members SET reserved_until = NULL WHERE id = $1 AND active', [member.id])
      await this.bump(db, member.room_id, true)
    }
    await this.reconcileRoom(db, member.room_id)
  }
  private async bump(db: Queryable, roomId: string, activity = false): Promise<void> {
    if (activity) await db.query('UPDATE kb_rooms SET version = version + 1, expires_at = $1 WHERE id = $2', [this.now() + this.roomTtlMs, roomId])
    else await db.query('UPDATE kb_rooms SET version = version + 1 WHERE id = $1', [roomId])
  }

  private async reconcileRoom(db: Queryable, roomId: string): Promise<void> {
    const room = (await db.query<RoomRow>('SELECT * FROM kb_rooms WHERE id = $1', [roomId])).rows[0]
    if (!room || room.status === 'closed') return
    const members = await this.members(db, roomId)
    if (!members.length) {
      await db.query("UPDATE kb_rooms SET status = 'closed', host_id = NULL WHERE id = $1", [roomId])
      await db.query('UPDATE kb_matches SET active=false WHERE room_id=$1 AND active', [roomId])
      return
    }
    if (members.some((member) => member.id === room.host_id && (room.status === 'waiting' || member.reserved_until === null || Number(member.reserved_until) > this.now()))) return
    const successor = members.find((member) => member.reserved_until === null)
    await db.query('UPDATE kb_rooms SET host_id = $1, version=version+1 WHERE id = $2 AND host_id IS DISTINCT FROM $1', [successor?.id ?? null, roomId])
  }

  private async snapshot(db: Queryable, self: MemberRow): Promise<RoomSnapshot | null> {
    const room = (await db.query<RoomRow>('SELECT * FROM kb_rooms WHERE id = $1', [self.room_id])).rows[0]
    if (!room || room.status === 'closed') return null
    const members = await this.members(db, room.id)
    if (!members.some((member) => member.id === self.id)) return null
    return {
      id: room.id, code: room.code, status: room.status, version: room.version, selfId: self.id, hostId: room.host_id,
      expiresAt: iso(room.expires_at),
      game: await this.publicGame(db, room.id, self.id),
      members: members.map((member) => ({
        id: member.id, nickname: member.nickname, avatarId: getAvatar(member.avatar_id).id,
        connected: member.reserved_until === null,
        joinedAt: iso(member.joined_at), reservedUntil: member.reserved_until === null ? null : iso(member.reserved_until),
      })),
    }
  }

  private async cleanup(db: Queryable): Promise<void> {
    const expired = await db.query<{ room_id: string }>(`
      UPDATE kb_members SET active = false, reserved_until = NULL
      WHERE active AND (
        (reserved_until <= $1 AND room_id IN (SELECT id FROM kb_rooms WHERE status = 'waiting'))
        OR guest_id IN (SELECT id FROM kb_guests WHERE expires_at <= $1)
        OR room_id IN (SELECT id FROM kb_rooms WHERE (expires_at <= $1 AND status = 'waiting') OR status = 'closed')
      ) RETURNING room_id`, [this.now()])
    for (const roomId of new Set(expired.rows.map((member) => member.room_id))) {
      await this.reconcileRoom(db, roomId)
      await this.bump(db, roomId)
    }
    // Session-scoped data lives only for the guest lifetime; this module does
    // not retain player histories or create a hidden persistent profile.
    await db.query('DELETE FROM kb_receipts WHERE guest_id IN (SELECT id FROM kb_guests WHERE expires_at <= $1)', [this.now()])
    await db.query('DELETE FROM kb_members WHERE guest_id IN (SELECT id FROM kb_guests WHERE expires_at <= $1)', [this.now()])
    await db.query('DELETE FROM kb_guests WHERE expires_at <= $1', [this.now()])
    await db.query("DELETE FROM kb_rooms WHERE status = 'closed' AND expires_at <= $1 AND NOT EXISTS (SELECT 1 FROM kb_members WHERE room_id = kb_rooms.id)", [this.now()])
  }
}
