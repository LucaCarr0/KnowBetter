import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { validateCatalog, type CatalogCategory, type CatalogQuestion, type TriviaCatalog } from './catalog'
import { validateBonusCatalog, type BonusCatalog, type BonusQuestion } from './bonus-catalog'

export const ITALIC_COMMIT = '92df420ff686babeea54e217b9f90f8471374916'
export const ITALIC_SHA256 = 'ca877846f19a6d781ba151382e4f43b10efad1a7e375b5e0c50b047a3917e0af'
const upstreamUrl = `https://github.com/Crisp-Unimib/ITALIC/blob/${ITALIC_COMMIT}/italic.jsonl`

const categories: CatalogCategory[] = [
  { id: 'art', name: 'Arte', icon: '🎨' },
  { id: 'history', name: 'Storia', icon: '🏛️' },
  { id: 'geography', name: 'Geografia', icon: '🌍' },
  { id: 'literature', name: 'Letteratura', icon: '📚' },
  { id: 'italian', name: 'Lingua italiana', icon: '✍️' },
  { id: 'civics', name: 'Educazione civica', icon: '⚖️' },
  { id: 'culture', name: 'Cultura e società', icon: '💡' },
]
const categoryMap: Record<string, string> = {
  art_history: 'art', history: 'history', geography: 'geography', literature: 'literature',
  orthography: 'italian', syntax: 'italian', lexicon: 'italian', morphology: 'italian',
  synonyms_and_antonyms: 'italian', civic_education: 'civics', current_events: 'culture', tourism: 'geography',
}
const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
}

export function normalizeText(text: string): string {
  let result = text
  // Some upstream HTML entities are escaped twice. This decodes text only;
  // it never parses markup or evaluates JavaScript from the downloaded source.
  for (let pass = 0; pass < 3; pass++) {
    const next = result.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (!code.startsWith('#')) return entities[code] ?? whole
      const point = code.toLowerCase().startsWith('#x') ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole
    })
    if (next === result) break
    result = next
  }
  return result.normalize('NFC').replace(/\s+/gu, ' ').trim()
}
const comparisonKey = (text: string) => normalizeText(text).normalize('NFKC').toLocaleLowerCase('it').replace(/[\s.]+$/gu, '').trim()
export interface ExcludedQuestion { sourceId: string; reason: string; duplicateOf?: string }
interface ItalicRow { question: string; options: Record<string, string>[]; answer: string; category: string }

export function normalizeItalic(source: string): { catalog: TriviaCatalog; exclusions: ExcludedQuestion[] } {
  const questions: CatalogQuestion[] = []
  const exclusions: ExcludedQuestion[] = []
  const seenPrompts = new Map<string, string>()
  const lines = source.trimEnd().split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const row = JSON.parse(lines[index]) as ItalicRow
    const sourceId = `${ITALIC_COMMIT}:L${index + 1}`
    const exclude = (reason: string, duplicateOf?: string) => exclusions.push({ sourceId, reason, ...(duplicateOf ? { duplicateOf } : {}) })
    if (!Array.isArray(row.options) || row.options.length !== 4) { exclude('not_four_options'); continue }
    if (typeof row.question !== 'string' || !row.question.trim() || !categoryMap[row.category]) { exclude('invalid_question_or_category'); continue }
    const options = row.options.map((entry) => {
      const entries = entry && typeof entry === 'object' ? Object.entries(entry) : []
      return entries.length === 1 && typeof entries[0][1] === 'string' ? { id: entries[0][0], text: normalizeText(entries[0][1]) } : { id: '', text: '' }
    })
    if (options.some((option) => !option.id || !option.text) || new Set(options.map((option) => option.id)).size !== 4 || !options.some((option) => option.id === row.answer)) {
      exclude('invalid_options_or_answer'); continue
    }
    if (new Set(options.map((option) => comparisonKey(option.text))).size !== 4) { exclude('duplicate_options'); continue }
    const prompt = normalizeText(row.question)
    const promptKey = comparisonKey(prompt)
    const duplicateOf = seenPrompts.get(promptKey)
    if (duplicateOf) { exclude('duplicate_prompt', duplicateOf); continue }
    seenPrompts.set(promptKey, sourceId)
    const hash = createHash('sha256').update(JSON.stringify({ prompt, options, answer: row.answer })).digest('hex').slice(0, 24)
    questions.push({
      id: `italic-${hash}`, categoryId: categoryMap[row.category], prompt, options,
      correctOptionId: row.answer, difficulty: 'medium', language: 'it',
      sourceUrl: `${upstreamUrl}#L${index + 1}`, sourceName: 'ITALIC — CRISP, Università di Milano-Bicocca',
      license: 'MIT', sourceId,
      sourceCategory: row.category, playable: row.category !== 'current_events',
    })
  }
  const catalog: TriviaCatalog = {
    version: `italic-${ITALIC_COMMIT.slice(0, 12)}-v1`, categories, questions,
    metadata: {
      importedAt: '2026-10-26', sourceRows: lines.length, importedRows: questions.length, excludedRows: exclusions.length,
      sourceCommit: ITALIC_COMMIT, sourceSha256: createHash('sha256').update(source).digest('hex'),
      independentlyFactChecked: false,
      difficultyPolicy: 'medium is an import default; ITALIC does not provide difficulty ratings',
      inactiveRows: questions.filter((question) => question.playable === false).length,
    },
  }
  validateCatalog(catalog)
  return { catalog, exclusions }
}

export async function importCatalog(): Promise<void> {
  const source = await readFile(new URL('./sources/italic/italic.jsonl', import.meta.url), 'utf8')
  if (createHash('sha256').update(source).digest('hex') !== ITALIC_SHA256) throw new Error('ITALIC source checksum differs from the pinned upstream snapshot.')
  const { catalog, exclusions } = normalizeItalic(source)
  const supplemental = await importSupplement()
  catalog.version += '-otqa-it-v2-otdb-it-v1'
  catalog.categories.push(...supplemental.categories)
  catalog.questions.push(...supplemental.questions)
  catalog.metadata.sourceRows += supplemental.questions.length
  catalog.metadata.importedRows += supplemental.questions.length
  catalog.metadata.supplementalRows = supplemental.questions.length
  validateCatalog(catalog)
  await writeFile(new URL('./supplement-it.json', import.meta.url), `${JSON.stringify(supplemental, null, 2)}\n`)
  await writeFile(new URL('./catalog.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`)
  await writeFile(new URL('./exclusions.json', import.meta.url), `${JSON.stringify(exclusions, null, 2)}\n`)
  await writeFile(new URL('./bonus-catalog.json', import.meta.url), `${JSON.stringify(await importBonus(), null, 2)}\n`)
  console.log(JSON.stringify({ version: catalog.version, sourceRows: catalog.metadata.sourceRows, importedRows: catalog.questions.length, excludedRows: exclusions.length }))
}

interface Translation { category: string; line: number; prompt: string; options: string[]; difficulty: string }
const otqaCommit = 'dcc1cdf36c2985ed5c849d1f2265c5041ffcdfb9'
const otqaHashes: Record<string, string> = {
  animals: '53b0dbac5d70b232e5d2c9ea0f7742807a6b318fc409856daba15b7a87c70585',
  movies: '774945aa764551247a81ca50404e869bd09175534eee2ad8f920485f0442b6e8',
  sports: '5d8dbb522356780f3b1a3bedea02c27768fe24cb9a8d60c7d70485143cbfcc7a',
}
interface OpenTdbQuestion { id: string; categoryId: number; type: 'multiple' | 'boolean'; difficulty: string; question: string; correctAnswer: string; incorrectAnswers: string[] }
interface OpenTdbTranslation { category: string; source: string; prompt: string; correct: string; incorrect: string[] }
interface BonusTranslation { source: string; prompt: string; true: string; false: string }
export const OPENTDB_SHA256 = 'da152b71a8ca8e4a3e903f8e7314693d6e6622615b977981c278e592dafafb2c'
const otdbSourceName = 'Open Trivia Database — PixelTail Games e contributori; adattamento italiano Know Better'

async function openTdbSource(): Promise<Map<string, OpenTdbQuestion>> {
  const raw = await readFile(new URL('./sources/opentdb/opentdb-verified.json', import.meta.url))
  if (createHash('sha256').update(raw).digest('hex') !== OPENTDB_SHA256) throw new Error('OpenTDB snapshot checksum changed.')
  const snapshot = JSON.parse(raw.toString('utf8')) as { questions: OpenTdbQuestion[] }
  return new Map(snapshot.questions.map((question) => [question.id, question]))
}

// The snapshot ID is a content hash, so its first hex digit gives a stable, source-independent answer position.
const stablePosition = (id: string, count: number) => parseInt(id[0], 16) % count

export async function importOpenTdb(): Promise<CatalogQuestion[]> {
  const sources = await openTdbSource()
  const translations = JSON.parse(await readFile(new URL('./opentdb-translations.json', import.meta.url), 'utf8')) as OpenTdbTranslation[]
  return translations.map((translation): CatalogQuestion => {
    const source = sources.get(translation.source)
    if (!source || source.type !== 'multiple' || source.incorrectAnswers.length !== 3 || translation.incorrect.length !== 3) {
      throw new Error(`OpenTDB translation ${translation.source} needs a four-choice verified source.`)
    }
    const texts = [...translation.incorrect]
    const position = stablePosition(source.id, 4)
    texts.splice(position, 0, translation.correct)
    return {
      id: `otdb-it-${source.id}`, categoryId: translation.category, prompt: translation.prompt,
      options: texts.map((text, index) => ({ id: String.fromCharCode(65 + index), text })),
      correctOptionId: String.fromCharCode(65 + position), difficulty: source.difficulty, language: 'it',
      sourceUrl: 'https://opentdb.com/', sourceName: otdbSourceName, license: 'CC-BY-SA-4.0',
      sourceId: `opentdb:${source.id}`, sourceCategory: `opentdb:${source.categoryId}`, playable: true,
    }
  })
}

export const BONUS_VERSION = 'bonus-21-it-20261029-v2'
export async function importBonus(): Promise<BonusCatalog> {
  const sources = await openTdbSource()
  const translations = JSON.parse(await readFile(new URL('./bonus-translations.json', import.meta.url), 'utf8')) as BonusTranslation[]
  const questions = translations.map((translation): BonusQuestion => {
    const source = sources.get(translation.source)
    if (!source) throw new Error(`Missing OpenTDB source for bonus ${translation.source}.`)
    const trueFirst = stablePosition(source.id, 2) === 0
    return {
      id: `bonus21-otdb-${source.id}`, categoryId: 'bonus-21', format: 'binary', catalogVersion: BONUS_VERSION,
      prompt: translation.prompt,
      options: [{ id: 'A', text: trueFirst ? translation.true : translation.false }, { id: 'B', text: trueFirst ? translation.false : translation.true }],
      correctOptionId: trueFirst ? 'A' : 'B', difficulty: source.difficulty, language: 'it',
      sourceUrl: 'https://opentdb.com/', sourceName: otdbSourceName, license: 'CC-BY-SA-4.0',
      sourceId: `opentdb:${source.id}`, playable: true,
      verification: { url: 'https://opentdb.com/', checkedAt: '2026-10-29', note: `Domanda verificata OpenTDB; risposta originale: ${source.correctAnswer}.` },
    }
  })
  const catalog: BonusCatalog = {
    version: BONUS_VERSION, categories: [{ id: 'bonus-21', name: '21 al contrario', icon: '🔄' }], questions,
    metadata: {
      createdAt: '2026-10-29', author: 'Know Better, da Open Trivia Database (CC BY-SA 4.0)', questionCount: questions.length,
      format: 'binary', factCheckedAt: '2026-10-29',
      verificationPolicy: 'Solo domande verificate dalla comunità OpenTDB; adattamento italiano e distrattore scelti per il formato a due opzioni.',
      difficultyPolicy: 'Difficoltà dichiarata da OpenTDB; ritmo e bilanciamento richiedono prove giocate.',
    },
  }
  validateBonusCatalog(catalog)
  return catalog
}

export async function importSupplement(): Promise<{ categories: CatalogCategory[]; questions: CatalogQuestion[] }> {
  const translations = JSON.parse(await readFile(new URL('./supplement-translations.json', import.meta.url), 'utf8')) as Translation[]
  const sources = new Map<string, string[]>()
  for (const [category, hash] of Object.entries(otqaHashes)) {
    const raw = await readFile(new URL(`./sources/opentriviaqa/${category}`, import.meta.url))
    if (createHash('sha256').update(raw).digest('hex') !== hash) throw new Error(`OpenTriviaQA ${category} checksum changed.`)
    sources.set(category, raw.toString('latin1').split(/\r?\n/))
  }
  const questions = translations.map((translation): CatalogQuestion => {
    const lines = sources.get(translation.category)
    if (!lines || !lines[translation.line - 1]?.startsWith('#Q ')) throw new Error(`Missing source for ${translation.category}:${translation.line}.`)
    const following = lines.slice(translation.line)
    const end = following.findIndex((line) => line.startsWith('#Q '))
    const block = end === -1 ? following : following.slice(0, end)
    const sourceOptions = block.filter((line) => /^[A-D] /.test(line))
    const sourceCorrect = block.find((line) => line.startsWith('^ '))?.slice(2).trim()
    const correct = sourceOptions.find((line) => line.slice(2).trim() === sourceCorrect)?.slice(0, 1)
    if (sourceOptions.length !== 4 || !correct || translation.options.length !== 4) throw new Error('Supplement source needs four unambiguous choices.')
    return {
      id: `otqa-it-${translation.category}-L${translation.line}`,
      categoryId: translation.category, prompt: translation.prompt,
      options: translation.options.map((text, index) => ({ id: String.fromCharCode(65 + index), text })),
      correctOptionId: correct, difficulty: translation.difficulty, language: 'it',
      sourceUrl: `https://github.com/uberspot/OpenTriviaQA/blob/${otqaCommit}/categories/${translation.category}#L${translation.line}`,
      sourceName: 'OpenTriviaQA — uberspot e contributori; adattamento italiano Know Better',
      license: 'CC-BY-SA-4.0', sourceId: `${otqaCommit}:${translation.category}:L${translation.line}`,
      sourceCategory: translation.category, playable: true,
    }
  })
  questions.push(...await importOpenTdb())
  return {
    categories: [
      { id: 'animals', name: 'Animali', icon: '🐾' },
      { id: 'movies', name: 'Cinema', icon: '🎬' },
      { id: 'sports', name: 'Sport', icon: '🏆' },
    ], questions,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void importCatalog().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
