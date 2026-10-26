import { readFileSync } from 'node:fs'

/** Private content: never import this module into a client component. */
export interface CatalogCategory { id: string; name: string; icon?: string }
export interface CatalogQuestion {
  id: string
  categoryId: string
  prompt: string
  options: { id: string; text: string }[]
  correctOptionId: string
  difficulty: string
  language: string
  sourceUrl: string
  sourceName: string
  license: string
  sourceId: string
  explanation?: string
  sourceCategory?: string
  playable?: boolean
}
export interface TriviaCatalog {
  version: string
  categories: CatalogCategory[]
  questions: CatalogQuestion[]
  metadata: {
    importedAt: string
    sourceRows: number
    importedRows: number
    excludedRows: number
    sourceCommit: string
    sourceSha256: string
    independentlyFactChecked: boolean
    difficultyPolicy: string
    supplementalRows?: number
    inactiveRows?: number
  }
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid catalog ${field}.`)
}

/** Fail closed before seeding a malformed or accidentally truncated data file. */
export function validateCatalog(input: unknown): asserts input is TriviaCatalog {
  if (!input || typeof input !== 'object') throw new Error('Invalid catalog.')
  const catalog = input as TriviaCatalog
  requireString(catalog.version, 'version')
  if (!Array.isArray(catalog.categories) || !catalog.categories.length || !Array.isArray(catalog.questions) || !catalog.questions.length) {
    throw new Error('The catalog needs categories and questions.')
  }
  const categoryIds = new Set<string>()
  for (const category of catalog.categories) {
    requireString(category.id, 'category id')
    requireString(category.name, 'category name')
    if (categoryIds.has(category.id)) throw new Error(`Duplicate catalog category ${category.id}.`)
    categoryIds.add(category.id)
  }
  const ids = new Set<string>()
  for (const question of catalog.questions) {
    for (const field of ['id', 'categoryId', 'prompt', 'correctOptionId', 'difficulty', 'language', 'sourceUrl', 'sourceName', 'license', 'sourceId'] as const) {
      requireString(question[field], `question ${field}`)
    }
    if (ids.has(question.id)) throw new Error(`Duplicate catalog question ${question.id}.`)
    ids.add(question.id)
    if (!categoryIds.has(question.categoryId)) throw new Error(`Unknown category for ${question.id}.`)
    if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error(`Expected four options for ${question.id}.`)
    const optionIds = new Set<string>()
    const optionTexts = new Set<string>()
    for (const option of question.options) {
      requireString(option.id, 'option id')
      requireString(option.text, 'option text')
      optionIds.add(option.id)
      optionTexts.add(option.text.normalize('NFKC').toLocaleLowerCase('it').replace(/[\s.]+$/gu, '').trim())
    }
    if (optionIds.size !== 4 || optionTexts.size !== 4 || !optionIds.has(question.correctOptionId)) {
      throw new Error(`Invalid or ambiguous options for ${question.id}.`)
    }
    if (!/^https:\/\//.test(question.sourceUrl)) throw new Error(`Expected an HTTPS source for ${question.id}.`)
  }
  if (!catalog.metadata || catalog.metadata.importedRows !== catalog.questions.length ||
    catalog.metadata.sourceRows !== catalog.metadata.importedRows + catalog.metadata.excludedRows) {
    throw new Error('Catalog import totals do not reconcile.')
  }
}

let cached: TriviaCatalog | undefined
export function getCatalog(): TriviaCatalog {
  if (!cached) {
    const parsed: unknown = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'))
    validateCatalog(parsed)
    cached = parsed
  }
  return cached
}
