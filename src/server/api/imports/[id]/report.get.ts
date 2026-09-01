/*
 * GET /api/imports/:id/report — Pruefbericht eines Imports.
 *
 * Alle Beanstandungen kommen von hier, gleich ob sie beim Lesen der Datei,
 * beim Zuordnen oder bei der Schemapruefung entstanden sind. Im PHP-Stand
 * standen Warnungen an zwei Stellen — Parse-Hinweise oben, Schemabefunde
 * unten —, und wer nur eine Liste las, uebersah die Haelfte.
 */
import type { Severity, ValidationIssue } from '#shared/types/domain'
import { db } from '../../../db'
import { countEdited } from '../../../lib/records'
import type { ExtendedImportReport } from '../../../lib/imports'
import { ownedImport } from '../_lib'
import { toListItem } from '../index.get'

function severityRank(s: Severity): number {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2
}

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const report = (row.report_json ?? null) as ExtendedImportReport | null

  const issues: ValidationIssue[] = [...(report?.issues ?? [])]
  // Schwerstes zuerst, innerhalb desselben Grades nach Zeile — so steht das
  // oben, was den Import aufhaelt.
  issues.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity)
    if (bySeverity !== 0) return bySeverity
    return (a.row ?? a.record ?? Number.MAX_SAFE_INTEGER) - (b.row ?? b.record ?? Number.MAX_SAFE_INTEGER)
  })

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1

  // Die heutige Fassung des Profils: Nur damit laesst sich sagen, ob dieses
  // Ergebnis noch zum aktuellen Stand passt.
  const sql = db()
  const version = row.mapping_profile_id === null
    ? null
    : (await sql<Array<{ version: number }>>`
        SELECT version FROM mapping_profiles WHERE id = ${row.mapping_profile_id}`)[0]?.version ?? null

  // Quellzeile -> Datensatz, damit eine Beanstandung auf den erzeugten Satz
  // zeigen kann. Bewusst hier abgeleitet und nicht in report_json abgelegt:
  // Nach einem erneuten Konvertieren traegt derselbe Bericht sonst Nummern,
  // die es nicht mehr gibt.
  const zeilen = [...new Set(issues.map((i) => i.row).filter((r): r is number => typeof r === 'number'))]
  const rowRecords: Record<number, number> = {}
  if (zeilen.length > 0) {
    const treffer = await sql<Array<{ id: number; source_row: number }>>`
      SELECT id, source_row FROM records
       WHERE import_id = ${row.id} AND source_row = ANY(${zeilen})`
    for (const r of treffer) rowRecords[r.source_row] = r.id
  }

  return {
    import: toListItem(row, await countEdited(sql, row.id), version),
    report,
    issues,
    counts,
    rowRecords,
    summary: report?.summary ?? null,
    mapping: report?.mapping ?? null,
    coverage: report?.coverage ?? null
  }
})
