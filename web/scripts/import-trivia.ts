import { createDatabase } from '../src/server/database'
import { importTrivia } from '../src/server/trivia'

async function main() {
  const database = await createDatabase({ url: process.env.DATABASE_URL, dataDir: process.env.LOBBY_DATA_DIR })
  try {
    const result = await importTrivia(database)
    console.log(JSON.stringify(result, null, 2))
  } finally { await database.close() }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
