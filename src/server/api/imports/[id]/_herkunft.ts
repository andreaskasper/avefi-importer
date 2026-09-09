/*
 * Womit dieses Ergebnis entstanden ist.
 *
 * `convert.ts` schreibt nach jedem Lauf ein `run_config` in die Zeile —
 * Profilversion, Schemaversion, Trennzeichen, Normdateneinstellungen und der
 * Zeitpunkt. Gelesen wurde die Spalte bisher nirgends. Damit stand die Angabe
 * zwar in der Datenbank, aber nirgendwo, wo jemand sie sieht.
 *
 * Gebraucht wird sie an genau der Stelle, die Jasper Stratil in #6 benannt hat:
 * Wer von einem konkreten Import kommt, will wissen, wie dieses Ergebnis
 * zustande kam. Fuer tabellarische Importe beantwortet das die Zuordnungsseite.
 * Fuer MARC-XML und AVefi-nativ gibt es keine Spaltenzuordnung, und damit bisher
 * gar keine Antwort.
 *
 * Zwei Angaben stehen bewusst nicht im `run_config`, sondern werden beim Lesen
 * aufgeloest: das Formatprofil und der heutige Stand des Zuordnungsprofils. Das
 * eine, weil `run_config` es nie mitgeschrieben hat und ein Nachtrag die alten
 * Zeilen nicht erreichen wuerde. Das andere, weil "heute" sich aendert.
 */
import type { Sql } from 'postgres'
import type { ImportRow, RunConfig } from '#shared/types/domain'

export interface Herkunft {
  /** Ob zu diesem Lauf ueberhaupt etwas aufgezeichnet wurde. */
  aufgezeichnet: boolean
  konvertiertAm: string | null
  formatProfil: { label: string; converterKey: string } | null
  zuordnungsProfil: {
    id: number
    name: string
    verwendeteVersion: number | null
    aktuelleVersion: number | null
  } | null
  schemaVersion: string | null
  trennzeichen: string | null
  normdaten: { aktiv: boolean; obergrenze: number | null } | null
}

export async function herkunft(sql: Sql, row: ImportRow): Promise<Herkunft> {
  const cfg = (row.run_config ?? null) as RunConfig | null

  let formatProfil: Herkunft['formatProfil'] = null
  if (row.format_profile_id !== null) {
    const [p] = await sql<{ label: string; converter_key: string }[]>`
      SELECT label, converter_key FROM format_profiles WHERE id = ${row.format_profile_id}`
    if (p !== undefined) formatProfil = { label: p.label, converterKey: p.converter_key }
  }

  /*
   * Die Profilnummer kommt aus dem Lauf, nicht aus der Zeile: Der Import kann
   * inzwischen einem anderen Profil zugeordnet sein als dem, mit dem er lief.
   * Nur wenn nichts aufgezeichnet ist, hilft die Zeile weiter.
   */
  const profilId = cfg?.profileId ?? row.mapping_profile_id
  let zuordnungsProfil: Herkunft['zuordnungsProfil'] = null
  if (profilId !== null) {
    const [p] = await sql<{ id: number; name: string; version: number }[]>`
      SELECT id, name, version FROM mapping_profiles WHERE id = ${profilId}`
    if (p !== undefined) {
      zuordnungsProfil = {
        id: p.id,
        name: p.name,
        verwendeteVersion: cfg?.profileVersion ?? row.mapping_version,
        aktuelleVersion: p.version
      }
    }
  }

  return {
    aufgezeichnet: cfg !== null,
    konvertiertAm: cfg?.at ?? null,
    formatProfil,
    zuordnungsProfil,
    schemaVersion: cfg?.avefiSchemaVersion ?? null,
    trennzeichen: cfg?.delimiter ?? row.delimiter ?? null,
    normdaten: cfg === null
      ? null
      : { aktiv: cfg.authorityEnabled, obergrenze: cfg.authorityLimit }
  }
}
