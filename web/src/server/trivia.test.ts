import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDatabase } from './database'
import { MIN_CATEGORY_QUESTIONS, importTrivia, loadTrivia } from './trivia'
import { isPlayableQuestion } from './game/engine'
import { getCatalog } from './content/catalog'
import { getBonusCatalog } from './content/bonus-catalog'

test('the complete compatible catalog is imported by category, idempotently, with answer keys and provenance', async () => {
  const database = await createDatabase({ dataDir: 'memory://' })
  try {
    const catalog = getCatalog()
    const bonus = getBonusCatalog()
    const first = await importTrivia(database)
    assert.equal(first.imported, true)
    assert.equal(first.questions, catalog.questions.length + bonus.questions.length)
    assert.equal(first.categories, catalog.categories.length + bonus.categories.length)
    assert.equal((await importTrivia(database)).imported, false)
    const content = await loadTrivia(database)
    assert.deepEqual(content.bonusQuestions, [...bonus.questions].sort((left, right) => left.id.localeCompare(right.id)))
    assert.equal(content.categories.some(category => category.id === 'bonus-21'), false)
    assert.equal(content.questions.some(question => question.id.startsWith('bonus21-')), false)
    assert.equal(content.questions.length, catalog.questions.filter(question => question.language === 'it' && question.playable !== false).length)
    const sample = catalog.questions.find(question => question.playable !== false && question.language === 'it')!
    assert.deepEqual(content.questions.find(question => question.id === sample.id), sample)
    const held = catalog.questions.filter(question => question.playable === false)
    for (const question of held) assert.equal(content.questions.some(entry => entry.id === question.id), false)
    const storedHeld = await database.transaction(db => db.query("SELECT count(*)::integer AS count FROM kb_trivia_questions WHERE question->>'playable'='false'"))
    assert.equal(storedHeld.rows[0].count, held.length)
    assert.equal(content.categories.length, 9)
    for (const category of content.categories) {
      assert.ok(content.questions.filter(question => question.categoryId === category.id && isPlayableQuestion(question)).length >= MIN_CATEGORY_QUESTIONS, category.name)
    }
    const imports = await database.transaction(db => db.query('SELECT count(*)::integer AS count FROM kb_content_imports'))
    assert.equal(imports.rows[0].count, 2)

    // Existing installs already have the ordinary catalog; only the missing bonus is added.
    await database.transaction(async db => {
      await db.query("DELETE FROM kb_trivia_questions WHERE question->>'format'='binary'")
      await db.query('DELETE FROM kb_content_imports WHERE version=$1', [bonus.version])
    })
    assert.equal((await loadTrivia(database)).bonusQuestions!.length, 0)
    assert.equal((await importTrivia(database)).imported, true)
    const restored = await loadTrivia(database)
    assert.equal(restored.questions.length, content.questions.length)
    assert.equal(restored.bonusQuestions!.length, bonus.questions.length)
    assert.equal((await importTrivia(database)).imported, false)

    await database.transaction(db => db.query("UPDATE kb_trivia_questions SET question=jsonb_set(question,'{playable}','false'::jsonb) WHERE id=$1", [bonus.questions[0].id]))
    const filtered = await loadTrivia(database)
    assert.equal(filtered.bonusQuestions!.length, bonus.questions.length - 1)
    assert.equal(filtered.questions.length, content.questions.length)
    await database.transaction(db => db.query("UPDATE kb_trivia_questions SET question=jsonb_set(question,'{options}',$2::jsonb) WHERE id=$1", [bonus.questions[1].id, JSON.stringify([{ id: 'A', text: 'unica' }])]))
    await assert.rejects(() => loadTrivia(database), /Invalid or ambiguous binary options/)
  } finally { await database.close() }
})

test('a newer catalog version retires rows it no longer ships and hides thin categories from the vote', async () => {
  const database = await createDatabase({ dataDir: 'memory://' })
  try {
    await importTrivia(database)
    const bonus = getBonusCatalog()
    const retired = { ...structuredClone(bonus.questions[0]), id: 'bonus21-addition-2-3', prompt: 'Quanto fa 2 + 3?', catalogVersion: 'bonus-21-it-20261028-v1' }
    await database.transaction(async db => {
      await db.query("INSERT INTO kb_trivia_questions(id,category_id,language,question) VALUES($1,'bonus-21','it',$2::jsonb)", [retired.id, JSON.stringify(retired)])
      await db.query("INSERT INTO kb_trivia_categories(id,name,icon) VALUES('thin','Poche domande','?')")
      await db.query("INSERT INTO kb_trivia_questions(id,category_id,language,question) SELECT 'thin-'||id,'thin','it',jsonb_set(question,'{categoryId}','\"thin\"') FROM kb_trivia_questions WHERE category_id='movies' LIMIT 5")
      await db.query('DELETE FROM kb_content_imports WHERE version=$1', [bonus.version])
    })
    assert.equal((await loadTrivia(database)).bonusQuestions!.some(question => question.id === retired.id), true)
    await importTrivia(database)
    const content = await loadTrivia(database)
    assert.equal(content.bonusQuestions!.length, bonus.questions.length)
    assert.equal(content.bonusQuestions!.some(question => question.id === retired.id), false)
    assert.equal(content.categories.some(category => category.id === 'thin'), false)
    const stored = await database.transaction(db => db.query("SELECT question->>'playable' AS playable FROM kb_trivia_questions WHERE id=$1", [retired.id]))
    assert.equal(stored.rows[0].playable, 'false')
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
