import type { LobbyDatabase } from './database'
import { isPlayableQuestion, type GameContent, type TriviaQuestion } from './game/engine'
import type { GameCategory } from '../features/game/types'
import { getCatalog } from './content/catalog'
import { getBonusCatalog, validateBonusQuestion, type BonusQuestion } from './content/bonus-catalog'

/** A category is offered in the vote only with this many playable questions, so rounds rarely repeat. */
export const MIN_CATEGORY_QUESTIONS = 300

/** The source catalog and answer keys are server-only, never public assets. */
export async function importTrivia(database: LobbyDatabase): Promise<{ version: string; imported: boolean; categories: number; questions: number }> {
  const catalogs = [getCatalog(), getBonusCatalog()]
  return database.transaction(async (db) => {
    let imported = false
    for (const catalog of catalogs) {
      const existing = await db.query('SELECT version FROM kb_content_imports WHERE version=$1', [catalog.version])
      if (existing.rows.length) continue
      imported = true
      await db.query(`INSERT INTO kb_trivia_categories(id,name,icon)
        SELECT id,name,icon FROM jsonb_to_recordset($1::jsonb) AS c(id text,name text,icon text)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon`, [JSON.stringify(catalog.categories)])
      for (let offset = 0; offset < catalog.questions.length; offset += 500) {
        await db.query(`INSERT INTO kb_trivia_questions(id,category_id,language,question)
          SELECT q->>'id',q->>'categoryId',q->>'language',q FROM jsonb_array_elements($1::jsonb) AS q
          ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,language=excluded.language,question=excluded.question`, [JSON.stringify(catalog.questions.slice(offset, offset + 500))])
      }
      // Rows of the same format dropped by a newer catalog version stay archived but are no longer drawn.
      const format = catalog.questions.some(question => 'format' in question && question.format === 'binary') ? 'binary' : 'trivia'
      await db.query(`UPDATE kb_trivia_questions SET question=jsonb_set(question,'{playable}','false'::jsonb)
        WHERE coalesce(question->>'format','trivia')=$1 AND NOT (id = ANY($2::text[]))`, [format, catalog.questions.map(question => question.id)])
      await db.query('INSERT INTO kb_content_imports(version,metadata) VALUES($1,$2::jsonb)', [catalog.version, JSON.stringify({ ...catalog.metadata, categories: catalog.categories.length, questions: catalog.questions.length })])
    }
    const counts = (await db.query<{ categories: number; questions: number }>(`SELECT
      (SELECT count(*)::integer FROM kb_trivia_categories) AS categories,
      (SELECT count(*)::integer FROM kb_trivia_questions) AS questions`)).rows[0]
    return { version: catalogs.map(catalog => catalog.version).join('+'), imported, ...counts }
  })
}

export async function loadTrivia(database: LobbyDatabase): Promise<GameContent> {
  return database.transaction(async (db) => {
    const questions = (await db.query<{ question: TriviaQuestion }>("SELECT question FROM kb_trivia_questions WHERE language='it' AND coalesce((question->>'playable')::boolean,true) AND coalesce(question->>'format','trivia')='trivia' ORDER BY id")).rows.map(row => row.question)
    const counts = new Map<string, number>()
    for (const question of questions.filter(isPlayableQuestion)) counts.set(question.categoryId, (counts.get(question.categoryId) ?? 0) + 1)
    const categories = (await db.query<GameCategory & Record<string, unknown>>('SELECT id,name,icon FROM kb_trivia_categories ORDER BY name')).rows
      .filter(category => (counts.get(category.id) ?? 0) >= MIN_CATEGORY_QUESTIONS)
    const bonusQuestions = (await db.query<{ question: BonusQuestion }>("SELECT question FROM kb_trivia_questions WHERE language='it' AND coalesce((question->>'playable')::boolean,true) AND question->>'format'='binary' ORDER BY id")).rows.map(row => row.question)
    for (const question of bonusQuestions) validateBonusQuestion(question)
    return { categories, questions, bonusQuestions }
  })
}
