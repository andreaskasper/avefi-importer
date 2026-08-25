/*
 * POST /api/reviews/:id/reject — ein Format ablehnen.
 *
 * Der Import wird nicht geloescht, sondern auf "error" gesetzt: Die Datei
 * bleibt herunterladbar, und wer spaeter doch einen Konverter baut, findet den
 * Vorgang wieder. Standardmaessig betrifft die Ablehnung nur diese eine Datei —
 * eine ganze Aufgabe zu verwerfen ist eine andere Entscheidung und muss
 * ausdruecklich verlangt werden.
 */
import { z } from 'zod'
import { db } from '../../../db'
import { setStatus } from '../../../lib/imports'
import { fail } from '../../imports/_lib'
import { findReview, requireReviewer, reviewIdOf, siblingsOf } from '../_lib'

const Body = z.object({ scope: z.enum(['task', 'file']).default('file') })

export default defineEventHandler(async (event) => {
  await requireReviewer(event)
  const sql = db()

  const review = await findReview(sql, reviewIdOf(event))
  if (review === null) throw fail(404, 'review_not_found', {}, 'Pruefung nicht gefunden.')
  if (review.status !== 'open') {
    throw fail(409, 'review_closed', { status: review.status }, 'Diese Pruefung ist bereits entschieden.')
  }

  const parsed = Body.safeParse(await readBody(event).catch(() => ({})))
  const scope = parsed.success ? parsed.data.scope : 'file'
  const targets = scope === 'task' ? await siblingsOf(sql, review) : [review]

  for (const target of targets) {
    await setStatus(sql, target.import_id, 'error')
    await sql`UPDATE format_reviews SET status = 'rejected' WHERE id = ${target.id}`
  }

  return { ok: true, rejected: targets.length }
})
