import assert from 'node:assert/strict'
import test from 'node:test'
import { getBonusCatalog, validateBonusCatalog, validateBonusQuestion } from './bonus-catalog'
import { importBonus } from './import-trivia'

test('the bonus ships short Italian binary questions adapted from verified OpenTDB trivia', () => {
  const catalog = getBonusCatalog()
  validateBonusCatalog(catalog)
  assert.equal(catalog.questions.length, 286)
  assert.equal(new Set(catalog.questions.map(question => question.id)).size, 286)
  assert.equal(new Set(catalog.questions.map(question => question.prompt)).size, 286)
  assert.equal(catalog.questions.filter(question => question.calculation).length, 0)
  assert.ok(catalog.questions.every(question => question.prompt.length <= 90 && question.options.length === 2 &&
    question.options.every(option => option.text.length <= 30) && question.format === 'binary' &&
    question.language === 'it' && question.catalogVersion === catalog.version && question.verification.checkedAt === '2026-10-29' &&
    question.license === 'CC-BY-SA-4.0' && question.sourceId.startsWith('opentdb:')))
  assert.equal(catalog.questions.filter(question => question.correctOptionId === 'A').length, 154)
  assert.equal(catalog.questions.filter(question => question.correctOptionId === 'B').length, 132)
})

test('the shipped bonus catalog is reproducible from the pinned OpenTDB snapshot and translations', async () => {
  assert.deepEqual(await importBonus(), getBonusCatalog())
  assert.ok(getBonusCatalog().questions.every(question => !/^Quanto fa \d/.test(question.prompt)))
})

test('binary validation rejects ambiguity, limits, missing answer keys and missing verification', () => {
  const original = getBonusCatalog().questions[40]
  for (const alter of [
    (question: typeof original) => { question.options.push({ id: 'C', text: 'Una terza opzione' }) },
    (question: typeof original) => { question.options[1].text = question.options[0].text.toUpperCase() },
    (question: typeof original) => { question.options[1].id = question.options[0].id },
    (question: typeof original) => { question.correctOptionId = 'missing' },
    (question: typeof original) => { question.prompt = 'x'.repeat(91) },
    (question: typeof original) => { question.options[0].text = 'x'.repeat(31) },
    (question: typeof original) => { question.verification.url = 'http://example.com' },
    (question: typeof original) => { question.verification.note = '' },
  ]) {
    const question = structuredClone(original)
    alter(question)
    assert.throws(() => validateBonusQuestion(question))
  }
})

test('a truncated, duplicated or mismatched bonus catalog fails before database writes', () => {
  const original = getBonusCatalog()
  const short = structuredClone(original)
  short.questions.length = 104
  short.metadata.questionCount = 104
  assert.throws(() => validateBonusCatalog(short), /at least 105/)
  const duplicate = structuredClone(original)
  duplicate.questions[1] = duplicate.questions[0]
  assert.throws(() => validateBonusCatalog(duplicate), /Duplicate/)
  const mismatched = structuredClone(original)
  mismatched.questions[0].catalogVersion = 'old-version'
  assert.throws(() => validateBonusCatalog(mismatched), /unversioned/)
  const totals = structuredClone(original)
  totals.metadata.questionCount--
  assert.throws(() => validateBonusCatalog(totals), /metadata/)
})
