import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage, formatRows, inspectSql, queryReadOnly, readOnlySql } from './db'
import type { LobbyDatabase, Queryable } from '../server/database'

test('allows one read query with comments, literal semicolons, dollar quoting and escaped identifiers', () => {
  for (const sql of [
    'SELECT 1;',
    "/* pre */ SELECT ';' AS punctuation; -- tail",
    'SELECT $tag$one;two$tag$;',
    'SELECT $$one;two$$;',
    'SELECT "column;name" FROM "table";',
    "SELECT E'one\\\'two;';",
    '/* outside /* nested ; */ outside */ WITH value AS (SELECT 1) SELECT * FROM value;',
    'SHOW transaction_read_only;',
    'EXPLAIN SELECT * FROM kb_rooms;',
  ]) assert.equal(readOnlySql(sql), sql.trim())
})

test('rejects mutation, transaction control, multiple statements and unterminated SQL', () => {
  for (const sql of [
    'DELETE FROM kb_rooms;', 'UPDATE kb_rooms SET status=\'closed\';',
    'SET TRANSACTION READ WRITE;', 'COMMIT;', 'BEGIN;',
    'SELECT 1; COMMIT; DELETE FROM kb_rooms;', 'SELECT 1; SET TRANSACTION READ WRITE',
    'SELECT 1;;', "SELECT 'unterminated;", 'SELECT /* incomplete', 'SELECT $tag$no end;',
    '', '-- empty comment', ';SELECT 1;',
  ]) assert.throws(() => readOnlySql(sql), Error, sql)
})

test('console completeness ignores terminators inside strings and unfinished comments', () => {
  assert.equal(inspectSql("SELECT ';'").terminated, false)
  assert.equal(inspectSql("SELECT 'next\nline';").terminated, true)
  assert.equal(inspectSql('SELECT 1; /* not finished').incomplete, true)
  assert.equal(inspectSql('SELECT 1; -- finished').incomplete, false)
})

test('each user query starts read-only in its own database transaction', async () => {
  const calls: string[] = []
  const db: Queryable = { async query(sql) { calls.push(sql); return { rows: [] } } }
  const database: LobbyDatabase = {
    async transaction(work) { calls.push('transaction'); return work(db) },
    async close() {},
  }
  await queryReadOnly(database, 'SELECT 1;')
  assert.deepEqual(calls, ['transaction', 'SET TRANSACTION READ ONLY', 'SELECT 1;'])
  await assert.rejects(() => queryReadOnly(database, 'DELETE FROM kb_rooms;'))
  assert.equal(calls.length, 3)
})

test('formats JSON values without truncation and never prints database URL credentials in errors', () => {
  assert.equal(formatRows([{ value: BigInt(123), question: { text: 'Una domanda' } }]), '[\n  {\n    "value": "123",\n    "question": {\n      "text": "Una domanda"\n    }\n  }\n]')
  assert.match(errorMessage({ code: 'DB_IN_USE', message: 'internal' }), /Ferma pnpm dev/)
  assert.equal(errorMessage(new Error('Failed postgres://owner:password@localhost/db')), 'Failed [connessione PostgreSQL omessa]')
})
