/*
 * GET /api/imports/:id — alles, was die Detailseite eines Imports braucht.
 *
 * Die Detailseite des PHP-Stands zeigte jede Fehlerlage als „Das hat nicht
 * geklappt". Deshalb liefert dieser Endpunkt bewusst mehr als den Status: die
 * Stufe, an der es scheiterte, die Meldung des Hintergrundprozesses und, wo
 * vorhanden, die zeilengenaue Diagnose. Erst damit kann die Oberflaeche je
 * Lage einen eigenen Satz sagen.
 */
import { db } from '../../../db'
import { countEdited } from '../../../lib/records'
import { firstOrgFile, tableFile } from '../../../lib/storage'
import { lastFailedForImport } from '../../../worker/queue'
import { analyzeParse, type ParseDiagnostics } from '../../../lib/converters/parseDiagnostics'
import type { ExtendedImportReport } from '../../../lib/imports'
import { ownedImport } from '../_lib'
import { toListItem } from '../index.get'
import { herkunft } from './_herkunft'

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const sql = db()

  const edited = await countEdited(sql, row.id)
  const report = (row.report_json ?? null) as ExtendedImportReport | null
  const failed = row.status === 'error' ? await lastFailedForImport(sql, row.id) : null

  // Zeilengenaue Diagnose: bevorzugt die gespeicherte, sonst frisch gerechnet.
  // Altimporte haben keine im Bericht; ohne diesen Rueckfall bliebe die Seite
  // bei genau den Faellen leer, fuer die es sie gibt.
  let diagnostics = (report?.parseDetail ?? null) as ParseDiagnostics | null
  if (diagnostics === null && row.status === 'error') {
    const path = await tableFile(row.id)
    if (path !== null) diagnostics = await analyzeParse(path, row.base_format).catch(() => null)
  }

  const original = await firstOrgFile(row.id)

  /*
   * Der heutige Stand des Zuordnungsprofils, damit die Seite "veraltet" sagen
   * kann. `toListItem` bekam ihn hier bisher nicht, deshalb war `stale` auf der
   * Detailseite immer falsch — ausgerechnet auf der Seite, auf der die Auskunft
   * am ehesten gesucht wird.
   */
  const spur = await herkunft(sql, row)
  const profilVersion = spur.zuordnungsProfil?.aktuelleVersion ?? null

  return {
    import: toListItem(row, edited, profilVersion),
    herkunft: spur,
    report,
    sheets: report?.sheets ?? [],
    failed,
    diagnostics,
    hasOriginal: original !== null
  }
})
