/*
 * GET /api/doku/handbuch/:seite — ein einzelnes Kapitel als HTML.
 */
import { requireUser } from '../../../utils/session'
import { kapitelSeite } from '../../../lib/doku/handbuch'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const kennung = getRouterParam(event, 'seite') ?? ''
  const seite = await kapitelSeite(kennung)
  if (seite === null) throw createError({ statusCode: 404, statusMessage: 'Kapitel nicht vorhanden.' })
  return seite
})
