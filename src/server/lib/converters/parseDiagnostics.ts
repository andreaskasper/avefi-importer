/*
 * Verstaendliche Diagnose fuer Quelldateien, die sich nicht sauber lesen lassen.
 *
 * Je Befund: Schweregrad, Meldung, Position, ein Ausschnitt mit der markierten
 * Stelle und ein Klartexthinweis.
 *
 * Zwei Dinge sind gegenueber dem PHP-Stand geaendert:
 *  - Der Schweregrad wird gesetzt, nicht erraten. Dort ergab er sich aus der
 *    Frage, ob im deutschen Hinweistext das Wort "Format-Review" vorkam; eine
 *    umformulierte Meldung haette den Schweregrad still verschoben.
 *  - Ein unbekanntes Basisformat wird nicht mehr wie XML behandelt. Genau das
 *    fuehrte im Bestand zu Importen mit dem Befund "XML (fehlerhaft)", obwohl
 *    eine Arbeitsmappe hochgeladen worden war.
 */
import { readFile, stat } from 'node:fs/promises'
import type { BaseFormat, Severity, ValidationIssue } from '#shared/types/domain'
import { jsonHint, locateJsonError } from './jsonLint'
import { delimiterFor, readCsvRows } from './csv'
import { XMLValidator } from 'fast-xml-parser'

/** Ueber dieser Groesse wird nicht mehr zeilengenau analysiert. */
const MAX_SCAN_BYTES = 50 * 1024 * 1024

export interface DiagnosticSnippet {
  start: number
  lines: Array<{ no: number; text: string }>
  errorLine: number
  column: number | null
}

export interface DiagnosticEntry {
  severity: Severity
  message: string
  line: number | null
  column: number | null
  offset: number | null
  hint: string
  snippet: DiagnosticSnippet | null
}

export interface ParseDiagnostics {
  /** false = mindestens ein Befund mit Schweregrad "error". */
  ok: boolean
  format: string
  errors: DiagnosticEntry[]
}

export async function analyzeParse(path: string, baseFormat: BaseFormat | null): Promise<ParseDiagnostics> {
  switch (baseFormat) {
    case 'json':
      return analyzeJson(path)
    case 'csv':
    case 'tsv':
      return analyzeCsv(path, baseFormat)
    case 'xml':
    case 'ead':
    case 'marcxml':
      return analyzeXml(path, baseFormat)
    default:
      return {
        ok: true,
        format: baseFormat ? baseFormat.toUpperCase() : 'unbekannt',
        errors: []
      }
  }
}

function entry(
  severity: Severity,
  message: string,
  hint: string,
  opts: { line?: number | null; column?: number | null; offset?: number | null; raw?: string } = {}
): DiagnosticEntry {
  const line = opts.line ?? null
  const column = opts.column ?? null
  return {
    severity,
    message,
    line,
    column,
    offset: opts.offset ?? null,
    hint,
    snippet: opts.raw !== undefined && line !== null ? snippetOf(opts.raw, line, column) : null
  }
}

function snippetOf(raw: string, errorLine: number, column: number | null): DiagnosticSnippet {
  const lines = raw.split(/\r\n|\r|\n/)
  const from = Math.max(1, errorLine - 2)
  const to = Math.min(lines.length, errorLine + 2)
  const out: Array<{ no: number; text: string }> = []
  for (let i = from; i <= to; i++) {
    let text = lines[i - 1] ?? ''
    if (text.length > 240) text = `${text.slice(0, 240)} …`
    out.push({ no: i, text })
  }
  return { start: from, lines: out, errorLine, column }
}

function unreadable(format: string): ParseDiagnostics {
  return {
    ok: false,
    format,
    errors: [entry('error', 'Die Datei konnte nicht gelesen werden.', 'Pruefen, ob der Upload vollstaendig war.')]
  }
}

async function analyzeJson(path: string): Promise<ParseDiagnostics> {
  let size = 0
  try {
    size = (await stat(path)).size
  } catch {
    return unreadable('JSON')
  }

  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return unreadable('JSON')
  }

  if (size > MAX_SCAN_BYTES) {
    try {
      JSON.parse(raw)
      return { ok: true, format: 'JSON', errors: [] }
    } catch (e) {
      return {
        ok: false,
        format: 'JSON',
        errors: [
          entry(
            'error',
            `Die Datei ist zu gross fuer eine zeilengenaue Analyse. ${e instanceof Error ? e.message : ''}`.trim(),
            'Die Datei mit einem lokalen JSON-Pruefwerkzeug untersuchen.'
          )
        ]
      }
    }
  }

  const loc = locateJsonError(raw)
  if (loc === null) return { ok: true, format: 'JSON', errors: [] }
  return {
    ok: false,
    format: 'JSON',
    errors: [
      entry('error', loc.message, jsonHint(loc.message), {
        line: loc.line,
        column: loc.column,
        offset: loc.offset,
        raw
      })
    ]
  }
}

async function analyzeXml(path: string, baseFormat: BaseFormat): Promise<ParseDiagnostics> {
  const label = baseFormat === 'xml' ? 'XML' : baseFormat.toUpperCase()
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return unreadable(label)
  }

  const result = XMLValidator.validate(raw, { allowBooleanAttributes: true })
  if (result === true) return { ok: true, format: label, errors: [] }

  const err = result.err
  return {
    ok: false,
    format: label,
    errors: [
      entry('error', `${err.msg} (${err.code})`, xmlHint(err.code), {
        line: err.line,
        column: err.col,
        raw
      })
    ]
  }
}

function xmlHint(code: string): string {
  const c = code.toLowerCase()
  if (c.includes('unclosed') || c.includes('closing')) {
    return 'Oeffnendes und schliessendes Element passen nicht zusammen — Verschachtelung pruefen.'
  }
  if (c.includes('invalidchar') || c.includes('char')) return 'Ungueltiges Zeichen; & < > muessen als &amp; &lt; &gt; geschrieben werden.'
  if (c.includes('attr')) return 'Attributwerte muessen in Anfuehrungszeichen stehen und duerfen je Element nur einmal vorkommen.'
  return 'An der markierten Stelle Elemente, Verschachtelung und die Maskierung von & < > pruefen.'
}

async function analyzeCsv(path: string, baseFormat: BaseFormat): Promise<ParseDiagnostics> {
  const label = baseFormat.toUpperCase()
  const delimiter = await delimiterFor(path, baseFormat)
  const delimiterName = delimiter === '\t' ? 'Tabulator' : `„${delimiter}“`

  const errors: DiagnosticEntry[] = []
  let header: string[] | null = null
  let dataRows = 0
  let line = 0
  let ragged = 0

  try {
    for await (const cells of readCsvRows(path, { delimiter })) {
      line++
      if (header === null) {
        header = cells
        continue
      }
      if (cells.every((c) => c.trim() === '')) continue
      dataRows++
      if (cells.length !== header.length) {
        ragged++
        if (errors.length < 20) {
          errors.push(
            entry(
              'warning',
              `Zeile hat ${cells.length} Felder, erwartet wurden ${header.length} (laut Kopfzeile).`,
              `Vermutlich ein nicht maskiertes Trennzeichen oder Anfuehrungszeichen. Felder mit ${delimiterName} in "…" setzen.`,
              { line }
            )
          )
        }
      }
    }
  } catch (e) {
    return {
      ok: false,
      format: label,
      errors: [
        entry('error', `Die Datei konnte nicht zerlegt werden: ${e instanceof Error ? e.message : String(e)}`,
          'Trennzeichen und Anfuehrungszeichen pruefen.', { line })
      ]
    }
  }

  if (header === null) {
    return {
      ok: false,
      format: label,
      errors: [
        entry('error', 'Keine Kopfzeile gefunden — die Datei ist leer.', 'Die erste Zeile muss die Spaltennamen enthalten.', { line: 1 })
      ]
    }
  }
  if (dataRows === 0) {
    errors.push(
      entry('error', 'Die Datei enthaelt nur eine Kopfzeile, aber keine Datenzeilen.', 'Mindestens eine Datenzeile ergaenzen.', { line: 1 })
    )
  }
  if (ragged > 20) {
    errors.push(
      entry('info', `Insgesamt ${ragged} Zeilen weichen in der Feldzahl von der Kopfzeile ab.`, 'Die Datei mit gleichbleibender Feldzahl neu exportieren.')
    )
  }

  return { ok: !errors.some((e) => e.severity === 'error'), format: label, errors }
}

/** Uebersetzt die Diagnose in Berichtsmeldungen. */
export function diagnosticsToIssues(d: ParseDiagnostics): ValidationIssue[] {
  return d.errors.map((e) => ({
    severity: e.severity,
    message: e.hint === '' ? e.message : `${e.message} ${e.hint}`,
    row: e.line ?? undefined,
    code: `parse_${d.format.toLowerCase()}`
  }))
}
