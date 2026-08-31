/*
 * Tabellarische Quellen lesen: Kopfzeile, Stichprobe, Kopfzeilen-Hash.
 *
 * Die Normalisierung der Spaltennamen und die Hash-Bildung liegen in
 * server/lib/mapping/header.ts und werden von dort benutzt, nicht nachgebaut:
 * Ein zweiter Ort fuer dieselbe Regel waere ein zweiter Ort, an dem sie sich
 * unterscheiden kann. Diese Datei liest die Platte, jene rechnet.
 */
import type { BaseFormat, ProfileSample } from '#shared/types/domain'
import { buildHeader, isEmptyRow, type SourceRow } from '../mapping/header'
import { delimiterFor, readCsvRows, type Delimiter } from './csv'

/** So viele Datenzeilen wandern hoechstens in die Stichprobe des Profils. */
export const SAMPLE_ROWS = 200

/** Hoechstzahl verschiedener Werte je Spalte in der Stichprobe. */
const DISTINCT_LIMIT = 60

export interface TableInfo {
  delimiter: Delimiter
  /** Entdoppelte Spaltennamen — so adressiert das Mapping. */
  columns: string[]
  /** Die Namen, wie sie in der Datei stehen. */
  rawColumns: string[]
  hash: string
  /** Datenzeilen der Stichprobe (ohne Kopfzeile, ohne Leerzeilen). */
  rows: SourceRow[]
  /** Zahl aller Datenzeilen der Datei. */
  rowCount: number
  /** Zeilen, deren Feldzahl von der Kopfzeile abweicht. */
  raggedRows: number
  /** Je Spalte die verschiedenen Werte mit Haeufigkeit. */
  distinct: Record<string, Array<{ value: string; count: number }>>
  /** Je Spalte: gefuellt in X von Y Zeilen. */
  coverage: Record<string, { filled: number; total: number }>
}

/**
 * Liest Struktur und Stichprobe einer CSV/TSV.
 * Die Datei wird ganz durchlaufen, um rowCount und Belegung zu kennen;
 * gehalten werden nur die ersten `maxRows` Zeilen.
 */
export async function readTable(
  path: string,
  baseFormat: BaseFormat | null,
  maxRows = SAMPLE_ROWS,
  fixedDelimiter?: Delimiter | null
): Promise<TableInfo> {
  // Ein festgelegtes Trennzeichen schlaegt das Erraten. Ohne diesen Weg wird
  // bei jedem Lesen neu geraten, und dieselbe Datei kann nach einer Aenderung
  // an der Heuristik anders zerfallen — dasselbe Ergebnis waere dann nicht
  // mehr reproduzierbar, obwohl sich weder Datei noch Profil geaendert haben.
  const delimiter = fixedDelimiter ?? await delimiterFor(path, baseFormat)

  let columns: string[] = []
  let rawColumns: string[] = []
  let hash = ''
  const rows: SourceRow[] = []
  const distinctMap: Record<string, Map<string, number>> = {}
  const filled: Record<string, number> = {}
  let rowCount = 0
  let raggedRows = 0
  let first = true

  for await (const cells of readCsvRows(path, { delimiter })) {
    if (first) {
      const header = buildHeader(cells, baseFormat)
      columns = header.columns
      rawColumns = header.rawColumns
      hash = header.hash
      for (const name of columns) {
        distinctMap[name] = new Map()
        filled[name] = 0
      }
      first = false
      continue
    }

    if (cells.length !== columns.length && cells.some((c) => c.trim() !== '')) raggedRows++

    const row: SourceRow = {}
    columns.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })
    if (isEmptyRow(row)) continue

    rowCount++
    for (const [name, value] of Object.entries(row)) {
      const v = value.trim()
      if (v === '') continue
      filled[name] = (filled[name] ?? 0) + 1
      const bucket = distinctMap[name]
      if (bucket && (bucket.has(v) || bucket.size < DISTINCT_LIMIT)) {
        bucket.set(v, (bucket.get(v) ?? 0) + 1)
      }
    }
    if (rows.length < maxRows) rows.push(row)
  }

  const distinct: TableInfo['distinct'] = {}
  const coverage: TableInfo['coverage'] = {}
  for (const name of columns) {
    distinct[name] = [...(distinctMap[name] ?? new Map()).entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
    coverage[name] = { filled: filled[name] ?? 0, total: rowCount }
  }

  return { delimiter, columns, rawColumns, hash, rows, rowCount, raggedRows, distinct, coverage }
}

/**
 * Die Stichprobe, wie das Mappingprofil sie speichert. Ohne sie verweigert der
 * Editor den Dienst, deshalb wird sie beim Erkennen mitgeschrieben.
 */
export function toProfileSample(info: TableInfo, maxRows = 20): ProfileSample {
  return {
    columns: info.columns,
    rows: info.rows.slice(0, maxRows).map((r) => info.columns.map((c) => r[c] ?? '')),
    values: info.distinct,
    coverage: info.coverage
  }
}

/** Liefert die Datenzeilen einer Tabelle als benannte Zeilen, im Datenstrom. */
export async function* streamTableRows(
  path: string,
  baseFormat: BaseFormat | null,
  fixedDelimiter?: Delimiter | null
): AsyncGenerator<{ row: SourceRow; rowNumber: number; cells: string[] }> {
  const delimiter = fixedDelimiter ?? await delimiterFor(path, baseFormat)
  let columns: string[] | null = null
  let rowNumber = 0

  for await (const cells of readCsvRows(path, { delimiter })) {
    if (columns === null) {
      columns = buildHeader(cells, baseFormat).columns
      continue
    }
    const row: SourceRow = {}
    columns.forEach((name, i) => {
      row[name] = cells[i] ?? ''
    })
    if (isEmptyRow(row)) continue
    rowNumber++
    yield { row, rowNumber, cells }
  }
}
