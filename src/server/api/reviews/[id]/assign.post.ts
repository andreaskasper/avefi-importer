/*
 * POST /api/reviews/:id/assign — einem unbekannten Format einen Konverter zuordnen.
 *
 * Die Entscheidung gilt der Kopfzeile, nicht der einzelnen Datei. Deshalb
 * werden alle offenen Pruefungen derselben Institution mit demselben
 * Fingerabdruck aufgeloest und alle wartenden Importe zur Konvertierung
 * eingereiht. Wer zwanzig gleichartige Dateien hochgeladen hat, entscheidet
 * einmal — und nicht zwanzigmal dasselbe.
 */
import { z } from 'zod'
import { db } from '../../../db'
import { CONVERTER_LABELS, makeConverter } from '../../../lib/converters/factory'
import { ensureFormatProfile, setFormatProfile, setStatus } from '../../../lib/imports'
import { enqueue } from '../../../worker/queue'
import { fail } from '../../imports/_lib'
import { findReview, requireReviewer, reviewIdOf, siblingsOf } from '../_lib'

const Body = z.object({
  converterKey: z.string().min(1),
  /** "task" loest die ganze Aufgabe, "file" nur diese eine Datei. */
  scope: z.enum(['task', 'file']).default('task')
})

export default defineEventHandler(async (event) => {
  const user = await requireReviewer(event)
  const sql = db()

  const review = await findReview(sql, reviewIdOf(event))
  if (review === null) throw fail(404, 'review_not_found', {}, 'Pruefung nicht gefunden.')
  if (review.status !== 'open') {
    throw fail(409, 'review_closed', { status: review.status }, 'Diese Pruefung ist bereits entschieden.')
  }

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'converter_missing', {}, 'Kein Konverter gewaehlt.')
  const key = parsed.data.converterKey.trim()

  // Gueltig ist, was der Code kennt oder was als Formatprofil hinterlegt ist.
  const known = makeConverter(key, { baseFormat: review.base_format as never }) !== null
  const stored = await sql<Array<{ label: string }>>`
    SELECT label FROM format_profiles WHERE converter_key = ${key}`
  if (!known && stored.length === 0) {
    throw fail(400, 'converter_unknown', { key }, 'Diesen Konverter gibt es nicht.')
  }

  const label = stored[0]?.label ?? CONVERTER_LABELS[key] ?? key
  const profileId = await ensureFormatProfile(sql, key, label, review.base_format ?? 'csv')

  const targets = parsed.data.scope === 'file' ? [review] : await siblingsOf(sql, review)
  const started: string[] = []

  for (const target of targets) {
    await setFormatProfile(sql, target.import_id, profileId)
    await setStatus(sql, target.import_id, 'converting')
    await enqueue(sql, 'worker/convert', { import_id: target.import_id, converter_key: key }, target.import_id)
    await sql`UPDATE format_reviews SET status = 'resolved' WHERE id = ${target.id}`
    started.push(target.import_id)
  }

  return { ok: true, converter: key, label, started: started.length, imports: started, by: user.id }
})
