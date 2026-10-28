import assert from 'node:assert/strict'
import test from 'node:test'
import { getBonusCatalog, validateBonusCatalog, validateBonusQuestion } from './bonus-catalog'

test('the bonus ships 105 original short Italian binary questions with versioned verification', () => {
  const catalog = getBonusCatalog()
  validateBonusCatalog(catalog)
  assert.equal(catalog.questions.length, 105)
  assert.equal(new Set(catalog.questions.map(question => question.id)).size, 105)
  assert.equal(new Set(catalog.questions.map(question => question.prompt)).size, 105)
  assert.equal(catalog.questions.filter(question => question.calculation).length, 30)
  assert.ok(catalog.questions.every(question => question.prompt.length <= 90 && question.options.length === 2 &&
    question.options.every(option => option.text.length <= 30) && question.format === 'binary' &&
    question.language === 'it' && question.catalogVersion === catalog.version && question.verification.checkedAt === '2026-10-28'))
  assert.equal(catalog.questions.filter(question => question.correctOptionId === 'A').length, 53)
  assert.equal(catalog.questions.filter(question => question.correctOptionId === 'B').length, 52)
})

test('the original arithmetic has exactly one true result and one false distractor', () => {
  for (const question of getBonusCatalog().questions.filter(question => question.calculation)) {
    const { operator, left, right } = question.calculation!
    const result = operator === '+' ? left + right : operator === '−' ? left - right : left * right
    assert.equal(question.options.filter(option => Number(option.text) === result).length, 1)
    assert.equal(question.options.find(option => option.id === question.correctOptionId)!.text, String(result))
    const bad = structuredClone(question)
    bad.correctOptionId = bad.options.find(option => option.id !== bad.correctOptionId)!.id
    assert.throws(() => validateBonusQuestion(bad), /Incorrect bonus calculation/)
  }
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
  short.questions.pop()
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
