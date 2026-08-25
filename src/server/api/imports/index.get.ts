/*
 * GET /api/imports — Importliste der eigenen Institution.
 *
 * Der Pruefbericht selbst geht nicht mit: Er kann bei einer grossen Lieferung
 * fuenfhundert Meldungen umfassen, und die Liste braucht davon nur die Zahlen.
 * Was die Zeile anzeigt, wird hier ausgerechnet, nicht in der Oberflaeche.
 */
import { db } from '../../db'
import { listImports } from '../../lib/imports'
import { editedCounts } from '../../lib/records'
import { isTabular, type FormatDetail, type ImportRow, type Severity } from '#shared/types/domain'
import { requireInstitution } from './_lib'

export interface ImportListItem {
  id: string
  filename: string
  filesize: number
  base_format: string | null
  detected_format: string | null
  /** Bestandteile des Formathinweises; detected_format ist nur der Rueckfall. */
  format_detail: FormatDetail | null
  sheet_name: string | null
  status: string
  upload_progress: number
  record_count: number
  error_count: number
  created_at: string
  tabular: boolean
  /** Von Hand bearbeitete Datensaetze — die Rueckfrage beim Neukonvertieren nennt die Zahl. */
  edited: number
  hasReport: boolean
  issues: Record<Severity, number>
  hasSheets: boolean
  hasMapping: boolean
  canReconvert: boolean
  hasAvefi: boolean
  /** false = der Stand ist nicht gegen das Schema geprueft und darf nur zur Fehlersuche herunter. */
  validated: boolean
}

export function toListItem(row: ImportRow, edited: number): ImportListItem {
  const report = row.report_json as (ImportRow['report_json'] & { stage?: string; sheets?: unknown[] }) | null
  const issues: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const issue of report?.issues ?? []) issues[issue.severity] = (issues[issue.severity] ?? 0) + 1

  const converted = row.status === 'converted'
  const hasAvefi = converted || report?.stage === 'convert'
  const settled = row.status === 'converted' || row.status === 'error'

  return {
    id: row.id,
    filename: row.filename,
    filesize: Number(row.filesize ?? 0),
    base_format: row.base_format,
    detected_format: row.detected_format,
    format_detail: row.format_detail ?? null,
    sheet_name: row.sheet_name,
    status: row.status,
    upload_progress: row.upload_progress,
    record_count: row.record_count,
    error_count: row.error_count,
    created_at: row.created_at,
    tabular: isTabular(row.base_format),
    edited,
    hasReport: report !== null,
    issues,
    hasSheets: Array.isArray(report?.sheets) && report.sheets.length > 0,
    hasMapping: row.mapping_profile_id !== null,
    canReconvert: settled && (row.mapping_profile_id !== null || row.format_profile_id !== null),
    hasAvefi,
    validated: converted && issues.error === 0
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireInstitution(event)
  const sql = db()
  const [rows, edited] = await Promise.all([
    listImports(sql, user.institution_id),
    editedCounts(sql, user.institution_id)
  ])

  const imports = rows.map((r) => toListItem(r, edited[r.id] ?? 0))
  return {
    imports,
    kpi: {
      records: imports.reduce((n, i) => n + i.record_count, 0),
      awaiting: imports.filter(
        (i) => i.status === 'awaiting_format_review' || i.status === 'awaiting_sheet_choice'
      ).length
    }
  }
})
