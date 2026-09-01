/*
 * GET /api/doku/handbuch — die Uebersicht des Handbuchs.
 *
 * Liefert fertiges HTML; uebersetzt wird auf dem Server, nicht im Browser.
 */
import { requireUser } from '../../../utils/session'
import { uebersicht } from '../../../lib/doku/handbuch'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return await uebersicht()
})
