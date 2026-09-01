/*
 * CSV lesen und schreiben.
 *
 * Gelesen wird mit csv-parse, geschrieben von Hand — fuer eine Zeile CSV lohnt
 * keine zweite Bibliothek, und die Regeln (Trennzeichen, Anfuehrungszeichen
 * verdoppeln) sind hier vollstaendig sichtbar.
 *
 * Die Trennzeichenerkennung im PHP-Stand zaehlte die Zeichen der ersten Zeile
 * roh. Eine Kopfzeile wie  "Titel, Untertitel";"Jahr"  wurde damit als
 * Komma-Datei gelesen, weil das Komma im Feldinhalt mitgezaehlt wurde. Hier
 * wird stattdessen probeweise geparst: gewaehlt wird das Trennzeichen, das
 * ueber mehrere Zeilen die meisten und gleichmaessigsten Spalten liefert.
 */
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { parse } from 'csv-parse'

/** Reihenfolge ist die Rangfolge bei Gleichstand. */
export const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const
export type Delimiter = string

const BOM = '﻿'

/** Entfernt eine fuehrende Byte-Order-Mark. */
export function stripBom(s: string): string {
  return s.startsWith(BOM) ? s.slice(1) : s
}

/* ------------------------------------------------------------- Kodierung */

/*
 * Die Anwendung las jede Datei als UTF-8. Eine Datei aus einem aelteren
 * Tabellenprogramm ist das oft nicht, und der Fehler faellt nicht als Fehler
 * auf: aus "Franzoesisch" wird ein Wort mit einem Ersatzzeichen darin, das
 * durch die ganze Verarbeitung laeuft und sich in der Werteliste des Profils
 * dauerhaft neben dem richtigen Wert einnistet. Genau so gemeldet.
 *
 * Vertraglich geschuldet ist UTF-8. Eine Datei zurueckzuweisen, die sich
 * fehlerfrei lesen laesst, waere aber die schlechtere Antwort — zumal der Weg
 * "lokal umwandeln und neu hochladen" derjenige ist, der die Werteliste
 * verschmutzt hat. Also: erkennen, lesen, und im Bericht sagen, wie gelesen
 * wurde. Geraten wird nichts, was nicht nachher dasteht.
 */
export type SourceEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

/** Wie viele Bytes fuer die Erkennung betrachtet werden. */
const ENCODING_PROBE_BYTES = 256 * 1024

/**
 * Kodierung einer Datei bestimmen: Byte-Order-Mark zuerst, sonst der Versuch,
 * die Probe streng als UTF-8 zu lesen. UTF-8 ist so streng gebaut, dass eine
 * laengere Probe aus einer Datei einer anderen Kodierung fast sicher daran
 * scheitert; erst dann faellt die Wahl auf Windows-1252, die verbreitetste
 * Einbytekodierung in Exporten dieser Herkunft.
 */
export function sniffEncodingFromBuffer(buf: Buffer): SourceEncoding {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf-16le'
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf-16be'
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf-8'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return 'utf-8'
  } catch {
    return 'windows-1252'
  }
}

export async function sniffEncoding(path: string, bytes = ENCODING_PROBE_BYTES): Promise<SourceEncoding> {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return sniffEncodingFromBuffer(buf.subarray(0, bytesRead))
  } finally {
    await fh.close()
  }
}

/** Lesbarer Name fuer Bericht und Oberflaeche. */
export function encodingLabel(e: SourceEncoding): string {
  switch (e) {
    case 'utf-8': return 'UTF-8'
    case 'utf-16le': return 'UTF-16 (LE)'
    case 'utf-16be': return 'UTF-16 (BE)'
    case 'windows-1252': return 'Windows-1252'
  }
}

/**
 * Wandelt einen Bytestrom in Text. Nur noetig, wenn die Datei nicht UTF-8 ist —
 * bei UTF-8 bleibt der Weg unveraendert derselbe wie bisher.
 */
function decodeStream(encoding: SourceEncoding): Transform {
  const decoder = new TextDecoder(encoding)
  return new Transform({
    transform(chunk, _enc, done) {
      done(null, decoder.decode(chunk as Buffer, { stream: true }))
    },
    flush(done) {
      done(null, decoder.decode())
    }
  })
}

/** Liest den Anfang einer Datei als Text (fuer Erkennung und Diagnose). */
export async function readHead(path: string, bytes = 64 * 1024): Promise<string> {
  const encoding = await sniffEncoding(path)
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await fh.read(buf, 0, bytes, 0)
    return stripBom(new TextDecoder(encoding).decode(buf.subarray(0, bytesRead)))
  } finally {
    await fh.close()
  }
}

interface DelimiterScore {
  delimiter: string
  columns: number
  consistent: number
  rows: number
}

/** Bewertet ein Trennzeichen an einer Textprobe. */
function scoreDelimiter(sample: string, delimiter: string): DelimiterScore {
  const rows = parseSampleSync(sample, delimiter)
  if (rows.length === 0) return { delimiter, columns: 0, consistent: 0, rows: 0 }
  const columns = rows[0]?.length ?? 0
  const consistent = rows.filter((r) => r.length === columns).length
  return { delimiter, columns, consistent, rows: rows.length }
}

/**
 * Kleiner, synchroner CSV-Zerleger nur fuer die Probe. csv-parse arbeitet als
 * Datenstrom; fuer die Erkennung braucht es keinen Datenstrom, sondern eine
 * Antwort im selben Zug.
 */
function parseSampleSync(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const c = text[i] as string
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"' && field === '') {
      quoted = true
      i++
      continue
    }
    if (c === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  // Angebrochene letzte Zeile der Probe verwerfen: sie ist nur zufaellig kurz.
  if (rows.length === 0 && (field !== '' || row.length > 0)) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '')
}

/**
 * Erkennt das Trennzeichen. Beurteilt werden bis zu zehn Zeilen: Erst zaehlt,
 * wie viele Zeilen dieselbe Spaltenzahl haben wie die Kopfzeile, dann die
 * Spaltenzahl selbst. Ein Trennzeichen, das nur eine Spalte ergibt, kommt nie
 * in Frage — sonst gewaenne bei einer einspaltigen Datei das erste der Liste.
 */
export async function sniffDelimiter(path: string, fallback: Delimiter = ','): Promise<Delimiter> {
  const head = await readHead(path, 64 * 1024)
  return sniffDelimiterFromText(head, fallback)
}

/** Wie sniffDelimiter, aber auf einer bereits gelesenen Textprobe. */
export function sniffDelimiterFromText(text: string, fallback: Delimiter = ','): Delimiter {
  const lines = text.split('\n')
  const sample = lines.slice(0, 10).join('\n')
  if (sample.trim() === '') return fallback

  let best: DelimiterScore | null = null
  for (const d of CANDIDATE_DELIMITERS) {
    const score = scoreDelimiter(sample, d)
    if (score.columns < 2) continue
    if (
      best === null ||
      score.consistent > best.consistent ||
      (score.consistent === best.consistent && score.columns > best.columns)
    ) {
      best = score
    }
  }
  return best?.delimiter ?? fallback
}

/** Feste Wahl fuer TSV, sonst Erkennung. */
export async function delimiterFor(path: string, baseFormat: string | null | undefined): Promise<Delimiter> {
  if (baseFormat === 'tsv') return '\t'
  return sniffDelimiter(path, ',')
}

export interface CsvReadOptions {
  delimiter: Delimiter
  /** Hoechstzahl gelieferter Zeilen (Kopfzeile eingeschlossen). */
  maxRows?: number
  /** Bereits ermittelte Kodierung; sonst wird sie an der Datei bestimmt. */
  encoding?: SourceEncoding
}

/**
 * Liest eine CSV-Datei zeilenweise als Zellenlisten.
 *
 * `relax_column_count` ist Absicht: Eine Zeile mit zu vielen oder zu wenigen
 * Feldern soll den Import nicht abbrechen, sondern als Befund im Bericht
 * landen. Wer sie zaehlen will, vergleicht die Laenge mit der Kopfzeile.
 */
export async function* readCsvRows(path: string, opts: CsvReadOptions): AsyncGenerator<string[]> {
  const encoding = opts.encoding ?? (await sniffEncoding(path))
  const bytes = createReadStream(path)
  const source = encoding === 'utf-8' ? bytes : bytes.pipe(decodeStream(encoding))
  const parser = source.pipe(
    parse({
      delimiter: opts.delimiter,
      bom: true,
      quote: '"',
      escape: '"',
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: false,
      to: opts.maxRows
    })
  )
  for await (const record of parser) {
    yield (record as string[]).map((c) => (c === null || c === undefined ? '' : String(c)))
  }
}

/**
 * Eine CSV-Zeile bauen. Anfuehrungszeichen werden verdoppelt, nicht mit einem
 * Rueckstrich maskiert: Der PHP-Stand schrieb mit dem Rueckstrich als
 * Maskierzeichen und las an anderer Stelle ohne — bei einem Wert, der auf einen
 * Rueckstrich endet, ging dabei die Zeilenstruktur verloren.
 */
export function csvLine(values: readonly string[], delimiter: Delimiter = ','): string {
  const needsQuote = (v: string): boolean =>
    v.includes(delimiter) || v.includes('"') || v.includes('\n') || v.includes('\r')
  return (
    values
      .map((v) => (needsQuote(v) ? `"${v.replace(/"/g, '""')}"` : v))
      .join(delimiter) + '\n'
  )
}
