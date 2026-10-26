import { createInterface, type Interface } from 'node:readline'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createDatabase, type LobbyDatabase } from '../server/database'
import { isPlayableQuestion, type TriviaQuestion } from '../server/game/engine'

const usage = `Uso:
  pnpm db:inspect
  pnpm db:sql 'SELECT count(*) FROM kb_trivia_questions'
  pnpm db:console

Le query sono in sola lettura. Il database PGlite va aperto a server fermo.
DATABASE_URL e LOBBY_DATA_DIR sono le stesse impostazioni del coordinatore.`

const consoleHelp = `Comandi:
  .tables           Elenca le tabelle pubbliche.
  .schema [tabella]  Mostra colonne e tipi, per esempio .schema kb_trivia_questions.
  .clear            Scarta il comando SQL in preparazione.
  .help             Mostra questo aiuto.
  .exit             Chiude la console e il database.

Termina ogni query con ;. Sono ammessi SELECT, WITH, SHOW ed EXPLAIN.
Ogni comando usa una nuova transazione READ ONLY; nessun BEGIN/COMMIT manuale.

Esempi:
SELECT id, name FROM kb_trivia_categories ORDER BY name;
SELECT category_id, count(*) FROM kb_trivia_questions GROUP BY category_id;
SELECT version, imported_at FROM kb_content_imports ORDER BY imported_at DESC;
SELECT version, applied_at FROM kb_schema_migrations ORDER BY version;
SELECT id, question->>'prompt' AS domanda FROM kb_trivia_questions LIMIT 5;
SELECT status, count(*) FROM kb_rooms GROUP BY status;`

/** SQL-aware boundary detection; quoted semicolons and nested comments are data. */
export function inspectSql(sql: string): { mask: string; terminated: boolean; incomplete: boolean; separators: number } {
  let mask = ''
  let state: 'normal' | 'single' | 'double' | 'line' | 'block' | 'dollar' = 'normal'
  let dollarTag = ''
  let blockDepth = 0
  let escapeString = false
  let separators = 0
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index]
    const next = sql[index + 1]
    if (state === 'line') {
      if (char === '\n') { state = 'normal'; mask += '\n' }
      continue
    }
    if (state === 'block') {
      if (char === '/' && next === '*') { blockDepth++; index++ }
      else if (char === '*' && next === '/') { blockDepth--; index++; if (!blockDepth) state = 'normal' }
      continue
    }
    if (state === 'dollar') {
      if (sql.startsWith(dollarTag, index)) { index += dollarTag.length - 1; state = 'normal' }
      continue
    }
    if (state === 'single') {
      if (escapeString && char === '\\') index++
      else if (char === "'" && next === "'") index++
      else if (char === "'") state = 'normal'
      continue
    }
    if (state === 'double') {
      if (char === '"' && next === '"') index++
      else if (char === '"') state = 'normal'
      continue
    }
    if (char === '-' && next === '-') { state = 'line'; mask += ' '; index++; continue }
    if (char === '/' && next === '*') { state = 'block'; blockDepth = 1; mask += ' '; index++; continue }
    if (char === "'") {
      escapeString = /e/i.test(sql[index - 1] ?? '') && !/[a-z0-9_$]/i.test(sql[index - 2] ?? '')
      state = 'single'; mask += ' '; continue
    }
    if (char === '"') { state = 'double'; mask += ' '; continue }
    if (char === '$') {
      const tag = sql.slice(index).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0]
      if (tag) { state = 'dollar'; dollarTag = tag; index += tag.length - 1; mask += ' '; continue }
    }
    if (char === ';') separators++
    mask += char
  }
  return { mask, terminated: separators > 0, incomplete: state !== 'normal' && state !== 'line', separators }
}

export function readOnlySql(sql: string): string {
  const scanned = inspectSql(sql)
  if (scanned.incomplete) throw new Error('Query incompleta: controlla virgolette e commenti.')
  const statements = scanned.mask.split(';').map(part => part.trim()).filter(Boolean)
  if (scanned.separators > 1 || statements.length !== 1 || !/^\s*(SELECT|WITH|SHOW|EXPLAIN)\b/i.test(scanned.mask)) {
    throw new Error('Inserisci una sola query SELECT, WITH, SHOW o EXPLAIN. I comandi che modificano dati o transazioni non sono ammessi.')
  }
  return sql.trim()
}

export async function queryReadOnly(database: LobbyDatabase, sql: string, values?: unknown[]) {
  const query = readOnlySql(sql)
  return database.transaction(async (db) => {
    await db.query('SET TRANSACTION READ ONLY')
    return db.query(query, values)
  })
}

export function formatRows(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2)
}

function printRows(rows: Record<string, unknown>[]) {
  console.log(formatRows(rows))
  console.log(`${rows.length} ${rows.length === 1 ? 'riga' : 'righe'}.`)
}

async function inspect(database: LobbyDatabase) {
  const summary = await database.transaction(async (db) => {
    await db.query('SET TRANSACTION READ ONLY')
    const categories = (await db.query<{ id: string; name: string }>('SELECT id,name FROM kb_trivia_categories ORDER BY name')).rows
    const questions = (await db.query<{ category_id: string; language: string; question: TriviaQuestion }>('SELECT category_id,language,question FROM kb_trivia_questions')).rows
    const counts = (await db.query<{ rooms: number; activeRooms: number; matches: number; activeMatches: number }>(`SELECT
      (SELECT count(*)::integer FROM kb_rooms) AS rooms,
      (SELECT count(*)::integer FROM kb_rooms WHERE status <> 'closed') AS "activeRooms",
      (SELECT count(*)::integer FROM kb_matches) AS matches,
      (SELECT count(*)::integer FROM kb_matches WHERE active) AS "activeMatches"`)).rows[0]
    const imports = (await db.query('SELECT version,imported_at FROM kb_content_imports ORDER BY imported_at DESC')).rows
    const migrations = (await db.query('SELECT version,applied_at FROM kb_schema_migrations ORDER BY version')).rows
    const perCategory = categories.map(category => {
      const stored = questions.filter(row => row.category_id === category.id)
      return { id: category.id, name: category.name, stored: stored.length, playable: stored.filter(row => row.language === 'it' && isPlayableQuestion(row.question)).length }
    })
    return {
      storedCategories: categories.length,
      playableCategories: perCategory.filter(category => category.playable > 0).length,
      storedQuestions: questions.length,
      playableQuestions: perCategory.reduce((total, category) => total + category.playable, 0),
      categories: perCategory,
      imports,
      migrations,
      ...counts,
    }
  })
  console.log(JSON.stringify({ database: process.env.DATABASE_URL ? 'PostgreSQL esterno' : 'PGlite locale', ...summary }, null, 2))
}

async function showSchema(database: LobbyDatabase, table?: string) {
  if (table && !/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error('Nome tabella non valido. Esempio: .schema kb_matches')
  const result = await queryReadOnly(database, `SELECT table_name,column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' ${table ? 'AND table_name=$1' : ''}
    ORDER BY table_name,ordinal_position`, table ? [table] : undefined)
  printRows(result.rows)
}

/** Errors must not print connection strings, passwords or complete driver objects. */
export function errorMessage(error: unknown): string {
  const details = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {}
  if (details.code === 'DB_IN_USE') return 'DB_IN_USE: il database locale è già aperto. Ferma pnpm dev / pnpm start e riprova; non rimuovere il lock mentre il processo è attivo.'
  const message = typeof details.message === 'string' ? details.message : 'Errore durante l’accesso al database.'
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[connessione PostgreSQL omessa]')
}

export async function runCli(args: string[]): Promise<void> {
  const [mode, ...rest] = args
  if (mode === '--help' || mode === '-h' || mode === 'help') { console.log(usage); return }
  if (!['inspect', 'sql', 'console'].includes(mode) || (mode === 'sql' ? !rest.length : Boolean(rest.length))) {
    console.error(usage)
    process.exitCode = 2
    return
  }
  // Validate a standalone query before opening/migrating any database.
  const sql = mode === 'sql' ? readOnlySql(rest.join(' ')) : null
  let database: LobbyDatabase | undefined
  let reader: Interface | undefined
  let stopped = false
  const stop = (signal: 'SIGINT' | 'SIGTERM') => {
    stopped = true
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    reader?.close()
    process.stdin.pause()
  }
  const interrupt = () => stop('SIGINT')
  const terminate = () => stop('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    database = await createDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.LOBBY_DATA_DIR })
    if (stopped) return
    if (mode === 'inspect') { await inspect(database); return }
    if (sql) { printRows((await queryReadOnly(database, sql)).rows); return }
    console.log('Know Better · console SQL in sola lettura. .help per gli esempi; .exit per uscire.')
    reader = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) })
    reader.on('SIGINT', interrupt)
    let buffer = ''
    const prompt = () => { if (process.stdin.isTTY) { reader!.setPrompt(buffer ? '   ...> ' : 'kb-db> '); reader!.prompt() } }
    prompt()
    for await (const line of reader) {
      if (stopped) break
      const trimmed = line.trim()
      if (trimmed === '.exit' || trimmed === '.quit') { buffer = ''; break }
      if (trimmed === '.clear') { buffer = ''; prompt(); continue }
      if (trimmed === '.help') { console.log(consoleHelp); prompt(); continue }
      try {
        if (!buffer && trimmed === '.tables') {
          printRows((await queryReadOnly(database, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows)
        } else if (!buffer && /^\.schema(?:\s|$)/.test(trimmed)) {
          const parts = trimmed.split(/\s+/)
          if (parts.length > 2) throw new Error('Uso: .schema [tabella]')
          await showSchema(database, parts[1])
        } else if (!buffer && trimmed.startsWith('.')) {
          throw new Error('Comando sconosciuto. Usa .help per l’elenco.')
        } else {
          buffer += `${line}\n`
          const scanned = inspectSql(buffer)
          if (!scanned.incomplete && scanned.terminated) {
            const statement = buffer
            buffer = ''
            printRows((await queryReadOnly(database, statement)).rows)
          } else if (!scanned.mask.trim() && !scanned.incomplete) buffer = ''
        }
      } catch (error) {
        buffer = ''
        console.error(errorMessage(error))
        process.exitCode = 1
      }
      prompt()
    }
    if (!stopped && buffer.trim()) {
      console.error('Query incompleta scartata alla chiusura: termina il comando con ;.')
      process.exitCode = 2
    }
  } finally {
    reader?.close()
    await database?.close()
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void runCli(process.argv.slice(2)).catch(error => {
    console.error(errorMessage(error))
    if (!process.exitCode) process.exitCode = 1
  })
}
