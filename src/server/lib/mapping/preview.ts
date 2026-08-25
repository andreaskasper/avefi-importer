/*
 * MappingPreview — Vorschau des Mappingeditors und die Stichprobe des Profils.
 *
 * Die Vorschau zeigt je Quellspalte bis zu drei Beispiele. Sie werden GEZIELT
 * gesucht, statt einfach die ersten Zeilen zu nehmen: In einer der Testlisten ist
 * das Produktionsjahr in der ersten Zeile leer und die Regie in den ersten drei —
 * eine an Zeile 1 klebende Vorschau zeigt dort nichts und sieht aus, als sei die
 * Zuordnung kaputt. Gesucht werden deshalb je Spalte die ersten drei
 * VERSCHIEDENEN gefuellten Werte; bei Wertelisten ist das zugleich die Antwort
 * auf die Frage, ob die Zuordnung alle vorkommenden Schreibweisen abdeckt.
 *
 * Gerechnet wird nur die Vereinigungsmenge der dafuer noetigen Zeilen (gedeckelt),
 * nicht die ganze Stichprobe. Die Belegung je Spalte ("gefuellt in 57 von 77
 * Zeilen") faellt aus derselben Rechnung ab und wird mitgeliefert.
 */

import type { MappingJson, ProfileSample } from '#shared/types/domain'
import type { SourceRow } from './header.js'
import type { AvefiRecord } from './builder.js'
import type { CellResult, MappingCheck, MappingServices } from './runner.js'
import { canonicalOp, runChain } from './transform.js'
import { getTarget } from './targets.js'
import { runRow, staticCheck } from './runner.js'

/** Obergrenze gerechneter Zeilen. */
export const MAX_PREVIEW_ROWS = 60
/** Beispiele je Spalte. */
export const EXAMPLES_PER_COLUMN = 3
/** Verschiedene Schema-Beanstandungen im Bericht. */
export const MAX_SCHEMA_ISSUES = 25

export interface ColumnExample {
  /** Zeilennummer, 0-basiert im uebergebenen Zeilenfeld. */
  row: number
  raw: string
  /** Wie oft dieser Wert in der Stichprobe vorkommt. */
  count: number
}

export interface ColumnExamples {
  /** In wie vielen der betrachteten Zeilen ist die Spalte gefuellt? */
  filled: number
  examples: ColumnExample[]
}

/**
 * Je Spalte die ersten Beispiele mit verschiedenen gefuellten Werten samt
 * Zeilennummer und Haeufigkeit, dazu die Zahl der gefuellten Zeilen.
 *
 * Die Haeufigkeit wird weitergezaehlt, auch wenn schon genug Beispiele
 * beisammen sind — sonst stimmte die Belegung nicht.
 */
export function pickExamples(
  columns: readonly string[],
  rows: readonly SourceRow[],
  perColumn = EXAMPLES_PER_COLUMN
): Record<string, ColumnExamples> {
  const out: Record<string, ColumnExamples> = {}

  for (const col of columns) {
    let filled = 0
    const seen = new Map<string, number>()
    const examples: ColumnExample[] = []

    rows.forEach((row, i) => {
      const raw = String(row[col] ?? '').trim()
      if (raw === '') return
      filled++
      const at = seen.get(raw)
      if (at !== undefined) {
        const e = examples[at]
        if (e !== undefined) e.count++
        return
      }
      if (examples.length >= perColumn) return // weiterzaehlen, nicht abbrechen
      seen.set(raw, examples.length)
      examples.push({ row: i, raw, count: 1 })
    })

    out[col] = { filled, examples }
  }

  return out
}

/**
 * Stichprobe fuers Profil: Beispielwerte mit Haeufigkeit und Belegung je Spalte.
 * Das ist genau die Rechnung der Vorschau, nur ohne das Mapping anzuwenden.
 */
export function buildProfileSample(
  columns: readonly string[],
  rows: readonly SourceRow[],
  options: { totalRows?: number; sampleRows?: number; distinctPerColumn?: number } = {}
): ProfileSample {
  const total = options.totalRows ?? rows.length
  const sampleRows = options.sampleRows ?? 25
  const perColumn = options.distinctPerColumn ?? 60

  const values: Record<string, Array<{ value: string; count: number }>> = {}
  const coverage: Record<string, { filled: number; total: number }> = {}

  for (const col of columns) {
    const counts = new Map<string, number>()
    let filled = 0
    for (const row of rows) {
      const v = String(row[col] ?? '').trim()
      if (v === '') continue
      filled++
      const known = counts.get(v)
      if (known !== undefined) counts.set(v, known + 1)
      else if (counts.size < perColumn) counts.set(v, 1)
    }
    values[col] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))
    coverage[col] = { filled, total }
  }

  return {
    columns: [...columns],
    rows: rows.slice(0, sampleRows).map((r) => columns.map((c) => String(r[c] ?? ''))),
    values,
    coverage
  }
}

/* ---------------------------------------------------------------- Vorschau */

export interface PreviewColumn {
  examples: Array<ColumnExample & { outputs: CellResult['outputs']; errors: string[] }>
  /** n von of betrachteten Zeilen gefuellt; total ist die Zeilenzahl der Datei. */
  filled: { n: number; of: number; total: number }
}

export interface PreviewResult {
  columns: Record<string, PreviewColumn>
  /** Ein vollstaendig gerechneter Datensatz fuer die Strukturansicht. */
  canonical: AvefiRecord | null
  /** Beanstandungen der Schemapruefung, nach Haeufigkeit sortiert. */
  schema: Array<{ message: string; rows: number }>
  evaluatedRows: number
  checks: MappingCheck[]
  /** Belegung je Spalte, direkt fuer ProfileSample.coverage verwendbar. */
  coverage: Record<string, { filled: number; total: number }>
}

export interface PreviewInput {
  columns: readonly string[]
  rows: readonly SourceRow[]
  /** Zeilenzahl der ganzen Datei, falls groesser als die Stichprobe. */
  rowCount?: number
}

export interface PreviewOptions extends MappingServices {
  maxRows?: number
  perColumn?: number
  /**
   * Schemapruefung eines fertigen Datensatzes. Sie liegt ausserhalb der
   * Mappinglogik; ohne sie bleibt die Liste leer.
   */
  validateRecord?: (record: AvefiRecord) => string[]
}

/** Baut die Vorschau: Beispiele, gerechnete Ergebnisse, Hinweise. */
export function buildPreview(
  input: PreviewInput,
  mapping: MappingJson,
  options: PreviewOptions = {}
): PreviewResult {
  const columns = [...input.columns]
  const rows = [...input.rows]
  const total = input.rowCount ?? rows.length
  const maxRows = options.maxRows ?? MAX_PREVIEW_ROWS
  const perColumn = options.perColumn ?? EXAMPLES_PER_COLUMN

  const picked = pickExamples(columns, rows, perColumn)

  // Zeile 0 ist immer dabei: Sie liefert die Strukturvorschau — der AVefi-Baum
  // soll einen vollstaendigen Datensatz zeigen, nicht einen aus Bruchstuecken.
  const needed = new Set<number>()
  if (rows.length > 0) needed.add(0)
  for (const info of Object.values(picked)) {
    for (const e of info.examples) needed.add(e.row)
  }
  const indices = [...needed].slice(0, maxRows).sort((a, b) => a - b)

  const services: MappingServices = {
    ...(options.schema !== undefined ? { schema: options.schema } : {}),
    ...(options.resolveAuthority !== undefined ? { resolveAuthority: options.resolveAuthority } : {}),
    ...(options.lookupCountry !== undefined ? { lookupCountry: options.lookupCountry } : {}),
    ...(options.lookupLanguage !== undefined ? { lookupLanguage: options.lookupLanguage } : {})
  }

  const evaluated = new Map<number, Record<string, CellResult>>()
  let canonical: AvefiRecord | null = null
  const schemaTally = new Map<string, number>()
  const runtimeChecks: MappingCheck[] = []

  for (const idx of indices) {
    const row = rows[idx]
    if (row === undefined) continue
    const result = runRow(mapping, row, `vorschau${idx + 1}`, services, idx + 1)
    evaluated.set(idx, result.cells)
    runtimeChecks.push(...result.issues)
    if (canonical === null) canonical = result.canonical

    for (const message of options.validateRecord?.(result.canonical) ?? []) {
      schemaTally.set(message, (schemaTally.get(message) ?? 0) + 1)
    }
  }

  const out: Record<string, PreviewColumn> = {}
  const coverage: Record<string, { filled: number; total: number }> = {}

  for (const col of columns) {
    const info = picked[col] ?? { filled: 0, examples: [] }
    out[col] = {
      examples: info.examples.map((e) => {
        const cell = evaluated.get(e.row)?.[col]
        return {
          ...e,
          outputs: cell?.outputs ?? [],
          errors: cell?.errors ?? []
        }
      }),
      filled: { n: info.filled, of: rows.length, total }
    }
    coverage[col] = { filled: info.filled, total: rows.length }
  }

  const schema = [...schemaTally.entries()]
    .map(([message, count]) => ({ message, rows: count }))
    .sort((a, b) => b.rows - a.rows)
    .slice(0, MAX_SCHEMA_ISSUES)

  const checks = [
    ...staticCheck(mapping, options.schema),
    ...dedupeChecks(runtimeChecks),
    ...dataChecks(mapping, out)
  ]

  return { columns: out, canonical, schema, evaluatedRows: indices.length, checks, coverage }
}

/** Gleiche Beanstandung aus mehreren Zeilen nur einmal zeigen. */
function dedupeChecks(checks: readonly MappingCheck[]): MappingCheck[] {
  const seen = new Set<string>()
  const out: MappingCheck[] = []
  for (const c of checks) {
    const key = `${c.code ?? ''}|${c.sourceField ?? ''}|${c.targetField ?? ''}|${c.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/**
 * Hinweise, die erst an den Daten sichtbar werden. Die statische Analyse kennt
 * die Werte nicht: Dass in "Land" ein Schraegstrich steht und damit zwei Laender
 * gemeint sind, sieht man erst hier.
 */
export function dataChecks(mapping: MappingJson, columns: Record<string, PreviewColumn>): MappingCheck[] {
  const separators: ReadonlyArray<readonly [string, string]> = [
    [';', 'Semikolon'],
    ['/', 'Schraegstrich'],
    [',', 'Komma']
  ]
  const out: MappingCheck[] = []

  for (const [col, spec] of Object.entries(mapping.columns ?? {})) {
    if (typeof spec !== 'object' || spec === null || spec.ignore === true) continue
    const examples = columns[col]?.examples ?? []
    if (examples.length === 0) continue
    const pre = Array.isArray(spec.pre) ? spec.pre : []

    let reported = false
    for (const binding of spec.targets ?? []) {
      if (reported) break
      const target = getTarget(String(binding.target ?? ''))
      if (target === undefined || !target.multi) continue

      const chain = [...pre, ...(Array.isArray(binding.post) ? binding.post : [])]
      if (chain.some((s) => canonicalOp(String(s?.op ?? '')) === 'split')) continue

      for (const [sep, name] of separators) {
        const hits = examples.filter((e) => e.raw.includes(sep)).length
        if (hits < Math.max(1, Math.ceil(examples.length / 2))) continue
        out.push({
          severity: 'warning', code: 'data.separator', sourceField: col, targetField: target.key,
          message: `Die Werte enthalten ein ${name}. "${target.label}" nimmt mehrere Werte auf — mit `
            + '"Aufteilen" wird daraus je Wert ein eigener Eintrag statt einer langen Zeichenkette.',
          fix: { op: 'split', sep }
        })
        reported = true
        break
      }
    }
  }

  return out
}

/**
 * Rechnet eine einzelne Kette auf einen Wert — fuer die Sofortanzeige im Editor,
 * waehrend jemand an einem Konverter schraubt.
 */
export function previewChain(
  chain: Parameters<typeof runChain>[0],
  value: string,
  services: MappingServices = {}
): { value: string; list: string[]; errors: string[]; notes: string[] } {
  const ctx = {
    ...(services.schema !== undefined ? { schema: services.schema } : {}),
    ...(services.resolveAuthority !== undefined ? { resolveAuthority: services.resolveAuthority } : {}),
    ...(services.lookupCountry !== undefined ? { lookupCountry: services.lookupCountry } : {}),
    ...(services.lookupLanguage !== undefined ? { lookupLanguage: services.lookupLanguage } : {})
  }
  const result = runChain(chain, value, ctx)
  const list = Array.isArray(result.value) ? result.value.map((v) => String(v)) : [String(result.value)]
  return { value: list.join('; '), list, errors: result.errors, notes: result.notes }
}
