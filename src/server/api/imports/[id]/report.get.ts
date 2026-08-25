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

  return {
    import: toListItem(row, await countEdited(db(), row.id)),
    report,
    issues,
    counts,
    summary: report?.summary ?? null,
    mapping: report?.mapping ?? null,
    coverage: report?.coverage ?? null
  }
})
