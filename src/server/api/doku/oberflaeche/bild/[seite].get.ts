/*
 * GET /api/doku/oberflaeche/bild/:seite — der Bildschirmabzug einer Seite.
 *
 * Die Abzuege liegen neben den Beschreibungen und nicht unter public/: sie
 * gehen nur Angemeldete an.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { requireUser } from '../../../../utils/session'
import { bildpfad } from '../../../../lib/doku/oberflaeche'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const pfad = await bildpfad(getRouterParam(event, 'seite') ?? '')
  if (pfad === null) throw createError({ statusCode: 404, statusMessage: 'Bildschirmabzug nicht vorhanden.' })
  const info = await stat(pfad)
  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'content-length', info.size)
  return sendStream(event, createReadStream(pfad))
})
