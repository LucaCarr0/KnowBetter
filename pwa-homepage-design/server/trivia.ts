import type { LobbyDatabase } from './database'
import type { GameContent, TriviaQuestion } from './game/engine'
import type { GameCategory } from '../features/game/types'
import { getCatalog } from './content/catalog'

/** The source catalog and answer keys are server-only, never public assets. */
export async function importTrivia(database: LobbyDatabase): Promise<{ version: string; imported: boolean; categories: number; questions: number }> {
  const catalog = getCatalog()
  return database.transaction(async (db) => {
    const existing = await db.query('SELECT version FROM kb_content_imports WHERE version=$1', [catalog.version])
    if (!existing.rows.length) {
      await db.query(`INSERT INTO kb_trivia_categories(id,name,icon)
        SELECT id,name,icon FROM jsonb_to_recordset($1::jsonb) AS c(id text,name text,icon text)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon`, [JSON.stringify(catalog.categories)])
      for (let offset = 0; offset < catalog.questions.length; offset += 500) {
        await db.query(`INSERT INTO kb_trivia_questions(id,category_id,language,question)
          SELECT q->>'id',q->>'categoryId',q->>'language',q FROM jsonb_array_elements($1::jsonb) AS q
          ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,language=excluded.language,question=excluded.question`, [JSON.stringify(catalog.questions.slice(offset, offset + 500))])
      }
      await db.query('INSERT INTO kb_content_imports(version,metadata) VALUES($1,$2::jsonb)', [catalog.version, JSON.stringify({ ...catalog.metadata, categories: catalog.categories.length, questions: catalog.questions.length })])
    }
    const counts = (await db.query<{ categories: number; questions: number }>(`SELECT
      (SELECT count(*)::integer FROM kb_trivia_categories) AS categories,
      (SELECT count(*)::integer FROM kb_trivia_questions) AS questions`)).rows[0]
    return { version: catalog.version, imported: !existing.rows.length, ...counts }
  })
}

export async function loadTrivia(database: LobbyDatabase): Promise<GameContent> {
  return database.transaction(async (db) => {
    const categories = (await db.query<GameCategory & Record<string, unknown>>('SELECT id,name,icon FROM kb_trivia_categories ORDER BY name')).rows
    const questions = (await db.query<{ question: TriviaQuestion }>("SELECT question FROM kb_trivia_questions WHERE language='it' AND coalesce((question->>'playable')::boolean,true) ORDER BY id")).rows.map(row => row.question)
    return { categories, questions }
  })
}
