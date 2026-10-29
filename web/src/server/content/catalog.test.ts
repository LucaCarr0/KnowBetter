import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getCatalog, validateCatalog } from './catalog'
import { ITALIC_SHA256, importSupplement, normalizeItalic, normalizeText } from './import-trivia'
import { isPlayableQuestion } from '../game/engine'
import { MIN_CATEGORY_QUESTIONS } from '../trivia'

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
  assert.equal(catalog.questions.length, 8_430)
  assert.equal(catalog.metadata.sourceRows, 10_969)
  assert.equal(catalog.metadata.excludedRows, 2_539)
  assert.equal(catalog.metadata.independentlyFactChecked, false)
  assert.ok(catalog.questions.every((question) => question.language === 'it'))
  const source = readFileSync(new URL('./sources/italic/italic.jsonl', import.meta.url), 'utf8')
  assert.deepEqual(catalog.questions.filter((question) => question.license === 'MIT'), normalizeItalic(source).catalog.questions)
  const supplement = await importSupplement()
  assert.deepEqual(catalog.questions.filter((question) => question.license === 'CC-BY-SA-4.0'), supplement.questions)
  assert.deepEqual(supplement, JSON.parse(readFileSync(new URL('./supplement-it.json', import.meta.url), 'utf8')))
  assert.deepEqual(Object.fromEntries(['animals', 'movies', 'sports'].map((categoryId) => [categoryId, [
    supplement.questions.filter((question) => question.categoryId === categoryId && question.license === 'CC-BY-SA-4.0' && question.id.startsWith('otqa-')).length,
    supplement.questions.filter((question) => question.categoryId === categoryId && question.id.startsWith('otdb-')).length,
  ]])), { animals: [259, 58], movies: [94, 220], sports: [209, 129] })
})

test('every category players can vote for has at least 300 drawable questions', () => {
  const catalog = getCatalog()
  const counts = new Map<string, number>()
  for (const question of catalog.questions.filter((entry) => isPlayableQuestion(entry))) {
    counts.set(question.categoryId, (counts.get(question.categoryId) ?? 0) + 1)
  }
  assert.equal(counts.size, 9)
  assert.ok([...counts.values()].every((count) => count >= MIN_CATEGORY_QUESTIONS), JSON.stringify(Object.fromEntries(counts)))
  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 8_088)
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
