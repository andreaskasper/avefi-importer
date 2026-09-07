/*
 * GET /api/imports/:id/original — die hochgeladene Datei, unveraendert.
 *
 * Sie liegt in org/ und wird nie angefasst; nur so laesst sich hinterher
 * belegen, was geliefert wurde.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { firstOrgFile, sanitizeFilename } from '../../../lib/storage'
import { fail, ownedImport } from '../_lib'

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)

  const path = await firstOrgFile(row.id)
  if (path === null) throw fail(404, 'no_file', {}, 'Originaldatei fehlt.')
  const info = await stat(path).catch(() => null)
  if (info === null) throw fail(404, 'no_file', {}, 'Originaldatei fehlt.')

  // Umlaute im Dateinamen brauchen die Form nach RFC 5987; ohne sie kommt aus
  // „Erschliessungsdaten" beim Herunterladen Buchstabensalat.
  const name = sanitizeFilename(row.filename)
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  setHeader(event, 'content-type', 'application/octet-stream')
  setHeader(event, 'content-length', info.size)
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
  )
  return sendStream(event, createReadStream(path))
})
