/*
 * Was die Oberflaeche von den Import-Endpunkten erwartet.
 *
 * Bewusst eigene Typen und nicht die Datenbankzeile: Die Liste bekommt den
 * Pruefbericht nicht mit, und sie bekommt Felder, die es in der Tabelle nicht
 * gibt (etwa ob sich neu konvertieren laesst).
 */
import type { FormatDetail, ImportReport, Severity, ValidationIssue } from '#shared/types/domain'

export interface ImportListItem {
  id: string
  filename: string
  filesize: number
  base_format: string | null
  detected_format: string | null
  format_detail: FormatDetail | null
  sheet_name: string | null
  status: string
  upload_progress: number
  record_count: number
  error_count: number
  created_at: string
  tabular: boolean
  edited: number
  hasReport: boolean
  issues: Record<Severity, number>
  hasSheets: boolean
  hasMapping: boolean
  canReconvert: boolean
  hasAvefi: boolean
  validated: boolean
  /** Ergebnis aus einer aelteren Fassung des Mappingprofils — abgeleitet, nicht gespeichert. */
  stale: boolean
  ranWithVersion: number | null
  profileVersion: number | null
}

export interface ImportListResponse {
  imports: ImportListItem[]
  kpi: { records: number; awaiting: number }
}

export interface ImportStatusResponse {
  busy: boolean
  count: number
  imports: Record<string, { status: string; records: number; errors: number; progress: number }>
}

export interface SheetInfo {
  index: number
  name: string
  rows: number
  cols: number
  usable: boolean
}

export interface ReportSummary {
  records: number
  avefiRecords: number
  valid: number
  invalid: number
  rowErrors: number
}

export interface ExtendedReport extends ImportReport {
  stage?: string
  converter?: string | null
  sheets?: SheetInfo[]
  summary?: ReportSummary
  mapping?: Record<string, unknown> | null
  parseDetail?: unknown
}

export interface DiagnosticEntry {
  severity: Severity
  message: string
  line: number | null
  column: number | null
  offset: number | null
  hint: string
  snippet: {
    start: number
    lines: Array<{ no: number; text: string }>
    errorLine: number
    column: number | null
  } | null
}

export interface ParseDiagnostics {
  ok: boolean
  format: string
  errors: DiagnosticEntry[]
}

export interface FailedJob {
  classname: string
  error: string | null
  attempts: number
  finished_at: string | null
}

export interface ImportDetailResponse {
  import: ImportListItem
  report: ExtendedReport | null
  sheets: SheetInfo[]
  failed: FailedJob | null
  diagnostics: ParseDiagnostics | null
  hasOriginal: boolean
}

export interface ImportReportResponse {
  import: ImportListItem
  report: ExtendedReport | null
  issues: ValidationIssue[]
  counts: Record<Severity, number>
  /** Quellzeile -> Datensatz-Nummer, fuer den Sprung aus einer Beanstandung. */
  rowRecords: Record<number, number>
  summary: ReportSummary | null
  mapping: Record<string, unknown> | null
  coverage: Record<string, { filled: number; total: number }> | null
}

export interface SheetsResponse {
  import: { id: string; filename: string; status: string }
  sheets: SheetInfo[]
}

/** Abzeichenklasse aus app.css je Verarbeitungsstand. */
export const STATUS_BADGE: Record<string, string> = {
  uploading: 'b-neutral',
  queued: 'b-neutral',
  converting: 'b-info',
  awaiting_format_review: 'b-wait',
  awaiting_sheet_choice: 'b-wait',
  converted: 'b-ok',
  error: 'b-danger'
}

/** Staende, bei denen sich noch etwas von selbst aendert. */
export const BUSY_STATES = new Set(['uploading', 'queued', 'converting'])
