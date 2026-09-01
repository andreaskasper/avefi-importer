/**
 * Schema anlegen oder fortschreiben — von Hand.
 *
 * Seit dem 01.09.2026 tut die Anwendung das beim Start selbst (siehe
 * server/plugins/schema.ts). Dieser Aufruf bleibt fuer den Fall, dass die
 * Datenbank fremd verwaltet wird und `DB_SCHEMA_AUTO=0` gesetzt ist, und fuer
 * das erste Einrichten von der Kommandozeile.
 *
 * Aufruf: npm run migrate
 */
import { standaloneDb } from './config.js'
import { schemaAnwenden, schemaVonPlatte } from './schema.js'

const sql = standaloneDb()

try {
  const anzahl = await schemaAnwenden(sql, await schemaVonPlatte())
  console.log(`[migrate] Schema angewandt. ${anzahl} Tabellen.`)
} catch (e) {
  console.error('[migrate] Fehlgeschlagen:', e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await sql.end()
}
