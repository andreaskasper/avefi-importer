/*
 * GET /api/doku/oberflaeche — die Uebersicht der Oberflaechenbeschreibungen.
 *
 * Liefert fertiges HTML; uebersetzt wird auf dem Server, nicht im Browser.
 */
import { requireUser } from '../../../utils/session'
import { uebersicht } from '../../../lib/doku/oberflaeche'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return await uebersicht()
})
