import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'
import { acquireDatabaseLock } from './database-lock'

export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>
}

export interface LobbyDatabase {
  transaction<T>(work: (database: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// All lobby writes share this transaction lock. A single service instance is the
// supported realtime deployment; the database lock also protects invariants from
// accidental concurrent writers. A room holds at most ten participants.
const LOCK_ID = 563418291

const schema = `
CREATE TABLE IF NOT EXISTS kb_schema_migrations (
  version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kb_guests (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS kb_rooms (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('waiting', 'closed')),
  host_id text,
  version integer NOT NULL DEFAULT 1,
  expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS kb_members (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES kb_rooms(id),
  guest_id text NOT NULL REFERENCES kb_guests(id),
  nickname text NOT NULL,
  nickname_key text NOT NULL,
  avatar_id text NOT NULL,
  joined_at bigint NOT NULL,
  reserved_until bigint,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS kb_one_active_room_per_guest ON kb_members(guest_id) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS kb_room_unique_nickname ON kb_members(room_id, nickname_key) WHERE active;
CREATE INDEX IF NOT EXISTS kb_members_by_room ON kb_members(room_id) WHERE active;
CREATE INDEX IF NOT EXISTS kb_reserved_members ON kb_members(reserved_until) WHERE active;
CREATE TABLE IF NOT EXISTS kb_receipts (
  guest_id text NOT NULL REFERENCES kb_guests(id),
  request_id text NOT NULL,
  action text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  membership_id text,
  created_at bigint NOT NULL,
  PRIMARY KEY (guest_id, request_id)
);
INSERT INTO kb_schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
`

const gameMigration = `
ALTER TABLE kb_rooms DROP CONSTRAINT IF EXISTS kb_rooms_status_check;
ALTER TABLE kb_rooms ADD CONSTRAINT kb_rooms_status_check CHECK (status IN ('waiting','starting','playing','closed'));
CREATE TABLE IF NOT EXISTS kb_trivia_categories (
  id text PRIMARY KEY, name text NOT NULL, icon text
);
CREATE TABLE IF NOT EXISTS kb_trivia_questions (
  id text PRIMARY KEY, category_id text NOT NULL REFERENCES kb_trivia_categories(id),
  language text NOT NULL, question jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS kb_trivia_by_category ON kb_trivia_questions(category_id);
CREATE TABLE IF NOT EXISTS kb_content_imports (
  version text PRIMARY KEY, imported_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS kb_matches (
  id text PRIMARY KEY, room_id text NOT NULL REFERENCES kb_rooms(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true, state jsonb NOT NULL,
  created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS kb_one_match_per_room ON kb_matches(room_id) WHERE active;
INSERT INTO kb_schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
`

async function migrateGame(database: LobbyDatabase) {
  await database.transaction(async (db) => {
    const applied = await db.query('SELECT version FROM kb_schema_migrations WHERE version = 2')
    if (!applied.rows.length) {
      for (const statement of gameMigration.split(';').map(sql => sql.trim()).filter(Boolean)) await db.query(statement)
    }
  })
}

export async function createDatabase(options: { url?: string; dataDir?: string } = {}): Promise<LobbyDatabase> {
  if (options.url) {
    const pool = new Pool({ connectionString: options.url, max: 5 })
    const database: LobbyDatabase = {
      async transaction(work) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID])
          const result = await work(client as Queryable)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      },
      close: () => pool.end(),
    }
    await database.transaction(async (client) => { await client.query(schema) })
    await migrateGame(database)
    return database
  }

  const dataDir = options.dataDir ?? resolve(process.cwd(), '.data/knowbetter')
  const release = dataDir === 'memory://' ? async () => {} : await acquireDatabaseLock(dataDir)
  const startupMessages: string[] = []
  const engine = new PGlite(dataDir, {
    onStderr(message) {
      startupMessages.push(message)
      if (startupMessages.length > 40) startupMessages.shift()
      return true
    },
  })
  try { await engine.waitReady }
  catch (cause) {
    await release()
    const diagnostic = startupMessages.filter(message => /PANIC|FATAL|checkpoint|permission denied|no space/i.test(message)).join('\n')
    throw new Error(`Impossibile aprire il database PGlite in ${dataDir}.${diagnostic ? `\n${diagnostic}` : ''}\nI dati non sono stati cancellati. Un errore di checkpoint richiede il recupero da un backup verificato.`, { cause })
  }
  // PGlite has one connection. Queue transactions so separate callers cannot
  // accidentally run a query inside another caller's transaction.
  let tail = Promise.resolve()
  let closing: Promise<void> | undefined
  const database: LobbyDatabase = {
    transaction(work) {
      if (closing) return Promise.reject(new Error('Il database è in chiusura.'))
      const result = tail.then(() => engine.transaction(async (tx) => work({
        query: async <T extends Record<string, unknown>>(sql: string, values?: unknown[]) => {
          const result = await tx.query<T>(sql, values)
          return { rows: result.rows }
        },
      })))
      tail = result.then(() => undefined, () => undefined)
      return result
    },
    close() {
      closing ??= Promise.resolve().then(async () => {
        await tail
        await engine.close()
        await release()
      })
      return closing
    },
  }
  // exec accepts the multi-statement migration; normal data queries are always
  // parameterized and never include interpolated values.
  try {
    await engine.exec(schema)
    await migrateGame(database)
  } catch (error) {
    await database.close()
    throw error
  }
  return database
}
