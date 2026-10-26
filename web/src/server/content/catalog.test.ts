import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getCatalog, validateCatalog } from './catalog'
import { ITALIC_SHA256, importSupplement, normalizeItalic, normalizeText } from './import-trivia'

test('the pinned Italian source is complete and every exclusion reconciles', () => {
  const source = readFileSync(new URL('./sources/italic/italic.jsonl', import.meta.url), 'utf8')
  assert.equal(createHash('sha256').update(source).digest('hex'), ITALIC_SHA256)
  const { catalog, exclusions } = normalizeItalic(source)
  assert.equal(catalog.metadata.sourceRows, 10_000)
  assert.equal(catalog.questions.length, 7_461)
  assert.deepEqual(exclusions.reduce<Record<string, number>>((counts, row) => {
    counts[row.reason] = (counts[row.reason] ?? 0) + 1
    return counts
  }, {}), { not_four_options: 2_534, duplicate_options: 4, duplicate_prompt: 1 })
  assert.deepEqual(exclusions, JSON.parse(readFileSync(new URL('./exclusions.json', import.meta.url), 'utf8')))
  assert.equal(catalog.questions.filter((question) => question.playable === false).length, 82)
  assert.ok(catalog.questions.filter((question) => question.sourceCategory === 'current_events').every((question) => question.playable === false))
})

test('the shipped catalog reproduces all compatible Italian rows and all translated supplement rows', async () => {
  const catalog = getCatalog()
  validateCatalog(catalog)
  assert.equal(catalog.questions.length, 7_497)
  assert.equal(catalog.metadata.sourceRows, 10_036)
  assert.equal(catalog.metadata.excludedRows, 2_539)
  assert.equal(catalog.metadata.independentlyFactChecked, false)
  assert.ok(catalog.questions.every((question) => question.language === 'it'))
  const source = readFileSync(new URL('./sources/italic/italic.jsonl', import.meta.url), 'utf8')
  assert.deepEqual(catalog.questions.filter((question) => question.license === 'MIT'), normalizeItalic(source).catalog.questions)
  const supplement = await importSupplement()
  assert.deepEqual(catalog.questions.filter((question) => question.license === 'CC-BY-SA-4.0'), supplement.questions)
  assert.deepEqual(supplement, JSON.parse(readFileSync(new URL('./supplement-it.json', import.meta.url), 'utf8')))
  for (const categoryId of ['animals', 'movies', 'sports']) {
    assert.equal(supplement.questions.filter((question) => question.categoryId === categoryId).length, 12)
  }
})

test('all playable categories have enough distinct questions for five rounds and a replacement', () => {
  const catalog = getCatalog()
  const counts = new Map<string, number>()
  for (const question of catalog.questions.filter((entry) => entry.playable !== false)) {
    counts.set(question.categoryId, (counts.get(question.categoryId) ?? 0) + 1)
  }
  assert.equal(counts.size, 9)
  assert.ok([...counts.values()].every((count) => count >= 6))
  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 7_415)
})

test('text normalization decodes double-escaped content without executing markup', () => {
  assert.equal(normalizeText('  citt&amp;agrave;  e  &amp;egrave; &#x1F43E; '), 'città e è 🐾')
  assert.equal(normalizeText('&lt;script&gt;alert(1)&lt;/script&gt;'), '<script>alert(1)</script>')
  assert.equal(normalizeText('&#x110000;'), '&#x110000;')
})

test('invalid answers and duplicate choices fail before a catalog can seed the database', () => {
  const original = getCatalog()
  const badAnswer = structuredClone(original)
  badAnswer.questions[0].correctOptionId = 'missing'
  assert.throws(() => validateCatalog(badAnswer), /Invalid or ambiguous options/)
  const duplicate = structuredClone(original)
  duplicate.questions[0].options[1].text = duplicate.questions[0].options[0].text
  assert.throws(() => validateCatalog(duplicate), /Invalid or ambiguous options/)
})
