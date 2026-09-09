/**
 * Womit ein Ergebnis entstanden ist.
 *
 * Spiegelt server/api/imports/[id]/_herkunft.ts. `aufgezeichnet` unterscheidet
 * "es gab keine Zuordnung" von "es wurde nicht mitgeschrieben" — vor der
 * Einfuehrung von `run_config` konvertierte Importe koennen das zweite sein.
 */
export interface Herkunft {
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

export interface ImportDetailResponse {
  import: ImportListItem
  herkunft: Herkunft
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
  /** Zielfeldschluessel -> Auskunft. Nur die Felder, die in den Befunden vorkommen. */
  fieldHelp: Record<string, FieldHelp>
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
