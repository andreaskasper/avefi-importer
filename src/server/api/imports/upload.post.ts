/*
 * POST /api/imports/upload?name=<Dateiname> — Datei hochladen.
 *
 * Der Rumpf ist die Datei selbst, nicht ein Multipart-Umschlag. Grund ist der
 * Speicher: Multipart wird in Nitro vollstaendig in den Arbeitsspeicher
 * gelesen, und eine Lieferung mit zweihundert Megabyte hat dort nichts zu
 * suchen. So wandert der Datenstrom direkt auf die Platte, und der Browser
 * kann ueber XMLHttpRequest trotzdem den Fortschritt anzeigen.
 *
 * Geprueft wird vor dem Speichern: Was niemand lesen kann, wird gar nicht erst
 * abgelegt — und die Begruendung nennt den Ausweg, statt „nicht unterstuetzt"
 * zu sagen und den Menschen raten zu lassen.
 */
import { Transform } from 'node:stream'
import { db } from '../../db'
import { createImport, deleteImport, setFile, setStatus, setStoragePath } from '../../lib/imports'
import { deleteImportFiles, importDir, sanitizeFilename, storeOriginalStream } from '../../lib/storage'
import { enqueue } from '../../worker/queue'
import { baseFormatForUpload, fail, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, requireInstitution } from './_lib'

export default defineEventHandler(async (event) => {
  const user = await requireInstitution(event)

  const raw = String(getQuery(event).name ?? '').trim()
  if (raw === '') throw fail(400, 'no_filename', {}, 'Kein Dateiname angegeben.')
  const filename = sanitizeFilename(raw)

  // Vor dem Anlegen: ein Import, der nie lesbar sein wird, soll gar nicht entstehen.
  const baseFormat = baseFormatForUpload(filename)

  const declared = Number(getHeader(event, 'content-length') ?? '0')
  if (declared > MAX_UPLOAD_BYTES) {
    throw fail(413, 'too_large', { max: MAX_UPLOAD_MB, size: declared }, 'Datei zu gross.')
  }

  const sql = db()
  const row = await createImport(sql, {
    institutionId: user.institution_id,
    userId: user.id,
    filename,
    filesize: 0,
    baseFormat
  })

  let received = 0
  const limited = new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length
      if (received > MAX_UPLOAD_BYTES) {
        done(Object.assign(new Error('too_large'), { code: 'too_large' }))
        return
      }
      done(null, chunk)
    }
  })
  event.node.req.pipe(limited)

  let stored: { filename: string; size: number }
  try {
    stored = await storeOriginalStream(row.id, limited, filename)
  } catch (e) {
    await deleteImportFiles(row.id).catch(() => undefined)
    await deleteImport(sql, row.id).catch(() => undefined)
    const code = (e as { code?: string }).code
    if (code === 'too_large') {
      throw fail(413, 'too_large', { max: MAX_UPLOAD_MB }, 'Datei zu gross.')
    }
    if (e instanceof Error && e.message.includes('leer')) {
      throw fail(400, 'empty_file', {}, 'Datei ist leer.')
    }
    throw fail(500, 'store_failed', {}, 'Speichern fehlgeschlagen.')
  }

  await setFile(sql, row.id, stored.filename, stored.size, baseFormat)
  await setStoragePath(sql, row.id, importDir(row.id))
  await setStatus(sql, row.id, 'queued', 100)
  await enqueue(sql, 'worker/detect', { import_id: row.id }, row.id)

  return {
    import: {
      id: row.id,
      filename: stored.filename,
      filesize: stored.size,
      base_format: baseFormat,
      status: 'queued'
    }
  }
})
