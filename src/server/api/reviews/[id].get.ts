/*
 * GET /api/reviews/:id — eine Aufgabe der Formatpruefung.
 *
 * Mitgeliefert wird alles, was fuer die Entscheidung noetig ist: die
 * Strukturprobe, die zur Auswahl stehenden Konverter und die weiteren Dateien,
 * die auf dieselbe Entscheidung warten.
 */
import { db } from '../../db'
import { CONVERTER_LABELS } from '../../lib/converters/factory'
import { fail } from '../imports/_lib'
import { findReview, requireReviewer, reviewIdOf, sampleColumns, siblingsOf } from './_lib'

interface SampleRows {
  columns: string[]
  rows: string[][]
  /** Bei XML/JSON steht statt Spalten eine Baumprobe im Sample. */
  tree: { root: string; namespace: string; children: string[] } | null
}

function readSample(raw: unknown): SampleRows {
  const out: SampleRows = { columns: sampleColumns(raw), rows: [], tree: null }
  if (typeof raw !== 'object' || raw === null) return out
  const sample = (raw as Record<string, unknown>).sample
  if (Array.isArray(sample)) {
    out.rows = sample.slice(0, 5).map((row) => {
      if (Array.isArray(row)) return row.map((c) => String(c ?? ''))
      if (typeof row === 'object' && row !== null) {
        const r = row as Record<string, unknown>
        return out.columns.map((c) => String(r[c] ?? ''))
      }
      return [String(row ?? '')]
    })
    return out
  }
  if (typeof sample === 'object' && sample !== null) {
    const s = sample as Record<string, unknown>
    if (typeof s.root === 'string') {
      out.tree = {
        root: s.root,
        namespace: typeof s.namespace === 'string' ? s.namespace : '',
        children: Array.isArray(s.children) ? s.children.map((c) => String(c)) : []
      }
    }
  }
  return out
}

export default defineEventHandler(async (event) => {
  await requireReviewer(event)
  const sql = db()

  const review = await findReview(sql, reviewIdOf(event))
  if (review === null) throw fail(404, 'review_not_found', {}, 'Pruefung nicht gefunden.')

  const siblings = review.status === 'open' ? await siblingsOf(sql, review) : [review]
  const profiles = await sql<Array<{ converter_key: string; label: string }>>`
    SELECT converter_key, label FROM format_profiles ORDER BY label`

  const options = new Map<string, string>()
  for (const [key, label] of Object.entries(CONVERTER_LABELS)) options.set(key, label)
  for (const p of profiles) options.set(p.converter_key, p.label)

  return {
    review: {
      id: review.id,
      status: review.status,
      fingerprint: review.fingerprint,
      createdAt: review.created_at,
      institutionId: review.institution_id,
      institutionName: review.institution_name,
      importId: review.import_id,
      filename: review.filename,
      baseFormat: review.base_format,
      headerHash: review.header_hash,
      importStatus: review.import_status,
      uploadedAt: review.uploaded_at
    },
    sample: readSample(review.sample_json),
    converters: [...options.entries()].map(([key, label]) => ({ key, label })),
    waiting: siblings.map((s) => ({
      reviewId: s.id,
      importId: s.import_id,
      filename: s.filename,
      uploadedAt: s.uploaded_at,
      importStatus: s.import_status
    }))
  }
})
