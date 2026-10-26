import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDatabase } from './database'
import { importTrivia, loadTrivia } from './trivia'
import { getCatalog } from './content/catalog'

test('the complete compatible catalog is imported by category, idempotently, with answer keys and provenance', async () => {
  const database = await createDatabase({ dataDir: 'memory://' })
  try {
    const catalog = getCatalog()
    const first = await importTrivia(database)
    assert.equal(first.imported, true)
    assert.equal(first.questions, catalog.questions.length)
    assert.equal(first.categories, catalog.categories.length)
    assert.equal((await importTrivia(database)).imported, false)
    const content = await loadTrivia(database)
    assert.equal(content.questions.length, catalog.questions.filter(question => question.language === 'it' && question.playable !== false).length)
    const sample = catalog.questions.find(question => question.playable !== false && question.language === 'it')!
    assert.deepEqual(content.questions.find(question => question.id === sample.id), sample)
    const held = catalog.questions.filter(question => question.playable === false)
    for (const question of held) assert.equal(content.questions.some(entry => entry.id === question.id), false)
    const storedHeld = await database.transaction(db => db.query("SELECT count(*)::integer AS count FROM kb_trivia_questions WHERE question->>'playable'='false'"))
    assert.equal(storedHeld.rows[0].count, held.length)
    for (const category of content.categories) {
      const eligible = catalog.questions.filter(question => question.categoryId === category.id && question.playable !== false)
      if (eligible.length) assert.ok(content.questions.filter(question => question.categoryId === category.id).length >= 5, category.name)
    }
    const imports = await database.transaction(db => db.query('SELECT count(*)::integer AS count FROM kb_content_imports'))
    assert.equal(imports.rows[0].count, 1)
  } finally { await database.close() }
})

test('an existing v1 lobby is migrated in place and retains its room, member and guest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowbetter-migration-'))
  let database = await createDatabase({ dataDir: directory })
  try {
    await database.transaction(async db => {
      await db.query('ALTER TABLE kb_rooms DROP CONSTRAINT kb_rooms_status_check')
      await db.query("ALTER TABLE kb_rooms ADD CONSTRAINT kb_rooms_status_check CHECK(status IN ('waiting','closed'))")
      await db.query('DELETE FROM kb_schema_migrations WHERE version=2')
      await db.query("INSERT INTO kb_guests(id,token_hash,created_at,expires_at) VALUES('guest','hash',1,9999999999999)")
      await db.query("INSERT INTO kb_rooms(id,code,status,version,expires_at) VALUES('room','ABCDEF','waiting',7,9999999999999)")
      await db.query("INSERT INTO kb_members(id,room_id,guest_id,nickname,nickname_key,avatar_id,joined_at) VALUES('member','room','guest','Player','player','panda',1)")
    })
    await database.close()
    database = await createDatabase({ dataDir: directory })
    await database.transaction(async db => {
      const room = (await db.query('SELECT id,version FROM kb_rooms')).rows[0]
      assert.equal(room.id, 'room')
      assert.equal(room.version, 7)
      assert.equal((await db.query('SELECT id FROM kb_members')).rows[0].id, 'member')
      assert.equal((await db.query('SELECT id FROM kb_guests')).rows[0].id, 'guest')
      await db.query("UPDATE kb_rooms SET status='playing' WHERE id='room'")
      assert.equal((await db.query('SELECT version FROM kb_schema_migrations WHERE version=2')).rows.length, 1)
    })
  } finally { await database.close(); await rm(directory, { recursive: true, force: true }) }
})
