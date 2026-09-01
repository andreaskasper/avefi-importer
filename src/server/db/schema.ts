/**
 * Das Datenbankschema anlegen oder fortschreiben.
 *
 * `db/schema.sql` ist durchgaengig idempotent (CREATE TABLE IF NOT EXISTS,
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS) und laesst sich beliebig oft
 * anwenden. Bisher war das ein Handgriff: `npm run migrate`, von Hand, nach
 * dem Ausrollen. Am 01.09.2026 hat ein Tester deshalb
 *
 *     column "run_config" of relation "imports" does not exist
 *
 * gesehen — der Code war neu, das Schema alt. Niemand hatte etwas falsch
 * gemacht; es gab nur einen Schritt, an den man sich erinnern musste.
 *
 * Deshalb wendet die Anwendung das Schema jetzt beim Start selbst an. Zwei
 * Dinge machen das gefahrlos:
 *
 *  - Eine Vorkehrungssperre (`pg_advisory_lock`). Weboberflaeche und
 *    Hintergrundprozess starten gleichzeitig aus demselben Abbild; ohne Sperre
 *    fuehren beide dieselbe DDL zur selben Zeit aus, und PostgreSQL
 *    quittiert das mit einem Deadlock statt mit einem Schema.
 *  - Ein Fehlschlag beendet den Prozess. Ein Server, der mit veraltetem Schema
 *    hochkommt, sieht gesund aus und faellt erst beim Anwender auf.
 */
import type { Sql } from 'postgres'

/** Frei gewaehlt, aber fest: beide Prozesse muessen dieselbe Zahl nennen. */
const SPERRE = 728411

/**
 * Schema anwenden. Gibt die Zahl der Tabellen zurueck, die danach stehen.
 *
 * Die DDL wird uebergeben statt hier gelesen: Im Auslieferungsbau liegt sie
 * als Server-Mitbringsel im Bundle, ausserhalb davon als Datei auf der Platte.
 */
export async function schemaAnwenden(sql: Sql, ddl: string): Promise<number> {
  await sql`SELECT pg_advisory_lock(${SPERRE})`
  try {
    await sql.unsafe(ddl)
  } finally {
    // Auch nach einem Fehler: sonst wartet der naechste Start bis in alle Ewigkeit.
    await sql`SELECT pg_advisory_unlock(${SPERRE})`
  }
  const tabellen = await sql<{ n: string }[]>`
    SELECT tablename AS n FROM pg_tables WHERE schemaname = 'public'`
  return tabellen.length
}

/**
 * Soll beim Start automatisch angewandt werden?
 *
 * Wer das Schema selbst verwaltet — etwa weil die Datenbank einem anderen Haus
 * gehoert und Aenderungen dort durch eine Freigabe muessen — setzt
 * `DB_SCHEMA_AUTO=0`. Dann bleibt `npm run migrate` der Weg.
 */
export function schemaAutomatisch(): boolean {
  const wert = (process.env.DB_SCHEMA_AUTO ?? '1').trim().toLowerCase()
  return !['0', 'false', 'nein', 'no', 'off'].includes(wert)
}

/** Die DDL von der Platte lesen — fuer Prozesse ausserhalb von Nitro. */
export async function schemaVonPlatte(): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  return readFile(fileURLToPath(new URL('../../db/schema.sql', import.meta.url)), 'utf8')
}
