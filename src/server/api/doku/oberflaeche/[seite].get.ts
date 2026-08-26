/*
 * GET /api/doku/oberflaeche/:seite — eine einzelne Beschreibung als HTML.
 */
import { requireUser } from '../../../utils/session'
import { kapitelSeite } from '../../../lib/doku/oberflaeche'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const kennung = getRouterParam(event, 'seite') ?? ''
  const seite = await kapitelSeite(kennung)
  if (seite === null) throw createError({ statusCode: 404, statusMessage: 'Beschreibung nicht vorhanden.' })
  return seite
})
