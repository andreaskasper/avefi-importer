/*
 * Eine hochgeladene Beispieltabelle lesen.
 *
 * Die Datei wird NICHT abgelegt. Gespeichert werden nur Spaltennamen und einige
 * Beispielzeilen im Profil — genug, damit der Editor eine echte Vorschau
 * rechnen kann, und wenig genug, dass kein Bestand nebenher entsteht.
 *
 * Der Rumpf ist die Datei selbst (wie beim Import-Upload), der Dateiname steht
 * in der Abfrage. Multipart wuerde in Nitro vollstaendig in den Arbeitsspeicher
 * gelesen; das ist hier zwar verkraftbar, aber der Weg soll derselbe bleiben.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import type { BaseFormat } from '#shared/types/domain'
import { readTable } from '../../lib/converters/table'
import { extractSheet, listSheets } from '../../lib/converters/spreadsheet'
import { sanitizeFilename } from '../../lib/storage'
import { fail, type TableSource } from './_lib'

/** Beispieldateien sind klein. Alles darueber ist ein Missverstaendnis. */
export const MAX_SAMPLE_BYTES = 40 * 1024 * 1024
export const MAX_SAMPLE_MB = Math.round(MAX_SAMPLE_BYTES / 1048576)

/** Endung -> Basisformat. Was hier nicht steht, taugt nicht als Beispieltabelle. */
const SAMPLE_FORMATS: Record<string, BaseFormat> = {
  csv: 'csv',
  tsv: 'tsv',
  tab: 'tsv',
  txt: 'csv',
  xlsx: 'xlsx',
  xlsm: 'xlsx',
  xltx: 'xlsx'
}

export interface UploadedTable {
  filename: string
  baseFormat: BaseFormat
  source: TableSource
  /** Bei Arbeitsmappen: das gelesene Blatt. */
  sheet: string | null
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/** Beginnt die Datei mit einer JSON-Klammer? Dann gehoert sie in den Profil-Import. */
function looksLikeJson(data: Buffer): boolean {
  const head = data.subarray(0, 64).toString('utf8').replace(/^﻿/, '').trimStart()
  return head.startsWith('{') || head.startsWith('[')
}

/**
 * Liest die hochgeladene Tabelle und liefert Kopfzeile, Stichprobe und Hash.
 * Jede Fehlerlage bekommt einen eigenen Code — eine JSON-Datei im Tabellenfeld
 * ist etwas anderes als eine Tabelle ohne Kopfzeile.
 */
export async function readUploadedTable(event: H3Event): Promise<UploadedTable> {
  const raw = String(getQuery(event).name ?? '').trim()
  if (raw === '') throw fail(400, 'no_filename', {}, 'Kein Dateiname angegeben.')
  const filename = sanitizeFilename(raw)

  const ext = extensionOf(filename)
  const baseFormat = SAMPLE_FORMATS[ext]
  if (baseFormat === undefined) {
    if (ext === 'json') throw fail(415, 'json_here', {}, 'JSON gehoert in den Profil-Import.')
    throw fail(415, 'sample_format', { ext }, `Format .${ext} taugt nicht als Beispieltabelle.`)
  }

  const declared = Number(getHeader(event, 'content-length') ?? '0')
  if (declared > MAX_SAMPLE_BYTES) throw fail(413, 'too_large', { max: MAX_SAMPLE_MB }, 'Datei zu gross.')

  const data = await readRawBody(event, false)
  if (data === undefined || data.length === 0) throw fail(400, 'empty_file', {}, 'Datei ist leer.')
  if (data.length > MAX_SAMPLE_BYTES) throw fail(413, 'too_large', { max: MAX_SAMPLE_MB }, 'Datei zu gross.')
  if (baseFormat !== 'xlsx' && looksLikeJson(data)) throw fail(415, 'json_here', {}, 'Das ist eine JSON-Datei.')

  const dir = await mkdtemp(join(tmpdir(), 'avefi-sample-'))
  try {
    const path = join(dir, filename)
    await writeFile(path, data)

    let readPath = path
    let sheet: string | null = null

    if (baseFormat === 'xlsx') {
      const sheets = await listSheets(path, 'xlsx').catch(() => [])
      const wanted = String(getQuery(event).sheet ?? '').trim()
      const chosen = sheets.find((s) => s.name === wanted) ?? sheets.find((s) => s.usable) ?? sheets[0]
      if (chosen === undefined) throw fail(422, 'no_sheet', {}, 'Die Arbeitsmappe enthaelt kein lesbares Blatt.')
      sheet = chosen.name
      readPath = join(dir, 'blatt.csv')
      await extractSheet(path, chosen.name, readPath, 'xlsx')
    }

    let table
    try {
      table = await readTable(readPath, baseFormat)
    } catch (e) {
      throw fail(422, 'table_unreadable', { detail: e instanceof Error ? e.message : String(e) },
        'Tabelle nicht lesbar.')
    }

    // Eine einzige Spalte heisst fast immer: falsches Trennzeichen oder gar
    // keine Tabelle. Ohne diese Pruefung entstand klaglos ein Profil mit einer
    // unsinnigen Spalte.
    if (table.columns.length < 2) {
      throw fail(422, 'no_header', { columns: table.columns.length }, 'Keine brauchbare Kopfzeile.')
    }

    return {
      filename,
      baseFormat,
      sheet,
      source: {
        columns: table.columns,
        rows: table.rows,
        rowCount: table.rowCount,
        distinct: table.distinct,
        headerHash: table.hash,
        baseFormat
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
