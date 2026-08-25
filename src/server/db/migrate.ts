/**
 * Schema anlegen oder fortschreiben.
 *
 * db/schema.sql ist durchgaengig idempotent (CREATE TABLE IF NOT EXISTS,
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS), laesst sich also gefahrlos
 * wiederholen. Aufruf: npm run migrate
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { standaloneDb } from './config.js'

const file = fileURLToPath(new URL('../../db/schema.sql', import.meta.url))
const sql = standaloneDb()

try {
  const ddl = await readFile(file, 'utf8')
  await sql.unsafe(ddl)
  const tables = await sql<{ n: string }[]>`
    SELECT tablename AS n FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  console.log(`[migrate] Schema angewandt. ${tables.length} Tabellen: ${tables.map((t) => t.n).join(', ')}`)
} catch (e) {
  console.error('[migrate] Fehlgeschlagen:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await sql.end()
}
