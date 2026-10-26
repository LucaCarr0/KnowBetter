import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from './database'
import { acquireDatabaseLock } from './database-lock'
import { queryReadOnly } from '../../scripts/db'

test('the database holds its process lock until close and safely opens again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowbetter-database-lock-'))
  let database = await createDatabase({ dataDir: directory })
  try {
    await assert.rejects(createDatabase({ dataDir: directory }), { code: 'DB_IN_USE' })
    const query = database.transaction(db => db.query('SELECT 42 AS answer'))
    await database.close()
    await database.close()
    assert.equal((await query).rows[0].answer, 42)
    database = await createDatabase({ dataDir: directory })
    assert.equal((await queryReadOnly(database, 'SHOW transaction_read_only')).rows[0].transaction_read_only, 'on')
    await assert.rejects(queryReadOnly(database, 'WITH changed AS (DELETE FROM kb_rooms RETURNING id) SELECT * FROM changed'), /read.only/i)
  } finally { await database.close(); await rm(directory, { recursive: true, force: true }) }
})

test('startup errors retain PostgreSQL diagnostics, release the lock and preserve the data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowbetter-database-diagnostic-'))
  const database = await createDatabase({ dataDir: directory })
  await database.close()
  try {
    const version = join(directory, 'PG_VERSION')
    await writeFile(version, '99\n')
    await assert.rejects(createDatabase({ dataDir: directory }), error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Impossibile aprire il database PGlite/)
      assert.match(error.message, /FATAL|incompatible/i)
      return true
    })
    assert.equal(await readFile(version, 'utf8'), '99\n')
    const release = await acquireDatabaseLock(directory)
    await release()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
