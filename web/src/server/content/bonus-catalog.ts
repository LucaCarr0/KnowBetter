import { readFileSync } from 'node:fs'
import type { CatalogCategory, CatalogQuestion } from './catalog'

/** Private answer keys: correctOptionId identifies the true option, which resets the chain. */
export interface BonusQuestion extends CatalogQuestion {
  format: 'binary'
  catalogVersion: string
  verification: { url: string; checkedAt: string; note: string }
  calculation?: { operator: '+' | '−' | '×'; left: number; right: number }
}

export interface BonusCatalog {
  version: string
  categories: CatalogCategory[]
  questions: BonusQuestion[]
  metadata: {
    createdAt: string
    author: string
    questionCount: number
    format: 'binary'
    factCheckedAt: string
    verificationPolicy: string
    difficultyPolicy: string
  }
}

const nonempty = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
const https = (value: unknown) => {
  if (!nonempty(value)) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function validateBonusQuestion(input: unknown): asserts input is BonusQuestion {
  if (!input || typeof input !== 'object') throw new Error('Invalid binary bonus question.')
  const question = input as BonusQuestion
  for (const field of ['id', 'categoryId', 'catalogVersion', 'prompt', 'correctOptionId', 'difficulty', 'sourceName', 'license', 'sourceId'] as const) {
    if (!nonempty(question[field])) throw new Error(`Invalid binary bonus question ${field}.`)
  }
  if (question.format !== 'binary' || question.language !== 'it' || question.prompt.length > 90 ||
    !Array.isArray(question.options) || question.options.length !== 2 ||
    question.options.some(option => !option || !nonempty(option.id) || !nonempty(option.text) || option.text.length > 30) ||
    new Set(question.options.map(option => option.id)).size !== 2 ||
    new Set(question.options.map(option => option.text.normalize('NFKC').toLocaleLowerCase('it').trim())).size !== 2 ||
    !question.options.some(option => option.id === question.correctOptionId)) {
    throw new Error(`Invalid or ambiguous binary options for ${question.id}.`)
  }
  if (!https(question.sourceUrl) || !question.verification || !https(question.verification.url) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(question.verification.checkedAt) || !nonempty(question.verification.note)) {
    throw new Error(`Missing binary verification for ${question.id}.`)
  }
  if (question.calculation) {
    const { operator, left, right } = question.calculation
    if (!['+', '−', '×'].includes(operator) || !Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
      throw new Error(`Invalid bonus calculation for ${question.id}.`)
    }
    const result = operator === '+' ? left + right : operator === '−' ? left - right : left * right
    if (!Number.isSafeInteger(result) || question.options.find(option => option.id === question.correctOptionId)?.text !== String(result)) {
      throw new Error(`Incorrect bonus calculation for ${question.id}.`)
    }
  }
}

export function validateBonusCatalog(input: unknown): asserts input is BonusCatalog {
  if (!input || typeof input !== 'object') throw new Error('Invalid binary bonus catalog.')
  const catalog = input as BonusCatalog
  if (!nonempty(catalog.version) || !Array.isArray(catalog.questions) || catalog.questions.length < 105 ||
    !Array.isArray(catalog.categories) || !catalog.categories.length ||
    catalog.categories.some(category => !category || !nonempty(category.id) || !nonempty(category.name)) ||
    new Set(catalog.categories.map(category => category.id)).size !== catalog.categories.length) {
    throw new Error('The binary bonus catalog needs at least 105 questions and valid categories.')
  }
  const categoryIds = new Set(catalog.categories.map(category => category.id))
  const ids = new Set<string>()
  const prompts = new Set<string>()
  for (const question of catalog.questions) {
    validateBonusQuestion(question)
    const prompt = question.prompt.normalize('NFKC').toLocaleLowerCase('it').trim()
    if (ids.has(question.id) || prompts.has(prompt) || !categoryIds.has(question.categoryId) || question.catalogVersion !== catalog.version) {
      throw new Error(`Duplicate, unversioned or uncategorized binary question ${question.id}.`)
    }
    ids.add(question.id)
    prompts.add(prompt)
  }
  if (!catalog.metadata || catalog.metadata.questionCount !== catalog.questions.length || catalog.metadata.format !== 'binary' ||
    !nonempty(catalog.metadata.author) || !nonempty(catalog.metadata.verificationPolicy) || !nonempty(catalog.metadata.factCheckedAt)) {
    throw new Error('Binary bonus catalog metadata does not reconcile.')
  }
}

let cached: BonusCatalog | undefined
export function getBonusCatalog(): BonusCatalog {
  if (!cached) {
    const parsed: unknown = JSON.parse(readFileSync(new URL('./bonus-catalog.json', import.meta.url), 'utf8'))
    validateBonusCatalog(parsed)
    cached = parsed
  }
  return cached
}
