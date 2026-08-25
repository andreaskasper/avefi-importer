/*
 * POST /api/imports/url — Datei von einer Adresse holen lassen.
 *
 * Der Abruf selbst gehoert in den Hintergrundprozess: Eine Lieferung von
 * siebzig Megabyte darf keine Anfrage offen halten. Hier wird nur geprueft,
 * ob die Adresse zulaessig ist, und der Auftrag eingestellt.
 */
import { z } from 'zod'
import { db } from '../../db'
import { createImport } from '../../lib/imports'
import { sanitizeFilename } from '../../lib/storage'
import { enqueue } from '../../worker/queue'
import { checkUrl, extensionOf, fail, filenameFromUrl, requireInstitution, UPLOAD_EXTENSIONS, REJECTED_WORKBOOKS } from './_lib'

const Body = z.object({ url: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const user = await requireInstitution(event)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'url_invalid', {}, 'Keine Adresse angegeben.')

  const url = checkUrl(parsed.data.url)
  const filename = sanitizeFilename(filenameFromUrl(url))
  const ext = extensionOf(filename)

  // Ein Format, das der Importer nicht lesen kann, soll nicht erst
  // heruntergeladen werden. Fehlt die Endung, entscheidet der Hintergrund-
  // prozess anhand des Dateianfangs — das ist bei Adressen der Normalfall.
  const rejected = REJECTED_WORKBOOKS[ext]
  if (rejected) throw fail(415, rejected, { ext }, `Format .${ext} wird nicht gelesen.`)
  const baseFormat = UPLOAD_EXTENSIONS[ext] ?? null

  const sql = db()
  const row = await createImport(sql, {
    institutionId: user.institution_id,
    userId: user.id,
    filename,
    filesize: 0,
    baseFormat
  })
  await enqueue(sql, 'worker/download', { import_id: row.id, url: url.toString() }, row.id)

  return { import: { id: row.id, filename, base_format: baseFormat, status: 'queued' } }
})
