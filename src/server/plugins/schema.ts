/**
 * Das Schema steht, bevor der erste Aufruf beantwortet wird.
 *
 * Grund siehe server/db/schema.ts: Ein Ausrollen ohne den Handgriff
 * `npm run migrate` hat einen Tester vor einen Fehler laufen lassen, den er
 * nicht verursacht hat und nicht deuten konnte.
 *
 * Die DDL kommt aus den Server-Mitbringseln (`nitro.serverAssets`), nicht von
 * der Platte: Der Auslieferungscontainer enthaelt nur `.output`, dort gibt es
 * kein `db/schema.sql`. Bisher liess sich das Schema in einer gebauten
 * Auslieferung daher ueberhaupt nicht anlegen — die Anleitung beschrieb einen
 * Weg, den das Abbild nicht hergab.
 */
import { schemaAnwenden, schemaAutomatisch } from '../db/schema'
import { standaloneDb } from '../db/config'

export default defineNitroPlugin(async () => {
  if (!schemaAutomatisch()) {
    console.log('[schema] DB_SCHEMA_AUTO=0 — Schema wird nicht angewandt.')
    return
  }
  const ddl = await useStorage('assets:db').getItem<string>('schema.sql')
  if (typeof ddl !== 'string' || ddl.trim() === '') {
    console.error('[schema] db/schema.sql liegt nicht im Bundle. Start abgebrochen.')
    process.exit(1)
  }
  const sql = standaloneDb()
  try {
    const anzahl = await schemaAnwenden(sql, ddl)
    console.log(`[schema] angewandt, ${anzahl} Tabellen.`)
  } catch (e) {
    // Kein Weiterlaufen: Ein Server mit veraltetem Schema sieht gesund aus und
    // faellt erst beim Anwender auf.
    console.error('[schema] Fehlgeschlagen, Start abgebrochen:', e instanceof Error ? e.message : e)
    process.exit(1)
  } finally {
    await sql.end()
  }
})
