/*
 * Auftrag "worker/download" — eine Datei von einer URL holen, unter org/
 * ablegen, das Basisformat bestimmen und einen Erkennungsauftrag einstellen.
 *
 * Zwei Aenderungen gegenueber dem PHP-Stand:
 *  - Nur http und https. Dort lief der Abruf ueber fopen() ohne Einschraenkung
 *    des Schemas; mit file:// oder php:// liess sich damit jede lesbare Datei
 *    des Containers in einen Import ziehen.
 *  - Keine stille Kuerzung. Dort brach der Kopiervorgang bei 200 MB ab und
 *    meldete Erfolg; eine halbe Datei sah aus wie eine ganze.
 */
import { createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Sql } from 'postgres'
import type { BaseFormat } from '#shared/types/domain'
import { importDir, prepareOrg, sanitizeFilename } from '../../lib/storage'
import { findImport, setFile, setStatus, setStoragePath } from '../../lib/imports'
import { enqueue } from '../queue'
import { guessBaseFormat } from './detect'

/** Groesster zulaessiger Download. Wird er ueberschritten, bricht der Auftrag ab. */
const MAX_BYTES = 512 * 1024 * 1024

export async function run(sql: Sql, payload: Record<string, unknown>): Promise<void> {
  const importId = String(payload.import_id ?? '')
  const record = importId !== '' ? await findImport(sql, importId) : null
  if (record === null) throw new Error('Import nicht gefunden.')

  const url = String(payload.url ?? '')
  if (url === '') throw new Error('Es wurde keine Adresse angegeben.')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Die Adresse „${url}“ ist keine gueltige URL.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Nur http und https sind zulaessig, angegeben war „${parsed.protocol}“.`)
  }

  const name = sanitizeFilename(record.filename !== '' ? record.filename : 'download')
  const dest = await prepareOrg(record.id, name)

  const response = await fetch(parsed, {
    redirect: 'follow',
    headers: { 'user-agent': 'AVefi-Importer' },
    signal: AbortSignal.timeout(600_000)
  })
  if (!response.ok) throw new Error(`Die Datei war nicht abrufbar (HTTP ${response.status}).`)
  if (response.body === null) throw new Error('Die Gegenstelle lieferte keinen Inhalt.')

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) {
    throw new Error(`Die Datei ist mit ${Math.round(declared / 1048576)} MB groesser als die zulaessigen ${MAX_BYTES / 1048576} MB.`)
  }

  let received = 0
  const counted = Readable.fromWeb(response.body as never).map((chunk: Buffer) => {
    received += chunk.length
    if (received > MAX_BYTES) {
      throw new Error(`Die Datei ueberschreitet die zulaessigen ${MAX_BYTES / 1048576} MB.`)
    }
    return chunk
  })

  try {
    await pipeline(counted, createWriteStream(dest, { mode: 0o664 }))
  } catch (e) {
    await unlink(dest).catch(() => undefined)
    throw e
  }

  const info = await stat(dest)
  if (info.size === 0) {
    await unlink(dest).catch(() => undefined)
    throw new Error('Die Gegenstelle lieferte eine leere Datei.')
  }

  const base: BaseFormat | null = await guessBaseFormat(dest, name)
  await setFile(sql, record.id, name, info.size, base)
  await setStoragePath(sql, record.id, importDir(record.id))
  await setStatus(sql, record.id, 'queued', 100)
  await enqueue(sql, 'worker/detect', { import_id: record.id }, record.id)

  console.log(`[download] ${name} (${(info.size / 1024).toFixed(1)} KB, ${base ?? '?'}) → detect`)
}
