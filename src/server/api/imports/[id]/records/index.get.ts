/*
 * GET /api/imports/:id/records — die Datensaetze eines Imports.
 *
 * Gesucht und geblaettert wird auf dem Server. Im PHP-Stand filterte ein
 * Skript die bereits gerenderten Zeilen; bei einem Import mit 2.738 Werken
 * suchte man damit in dem Ausschnitt, den die Seite zufaellig enthielt.
 *
 * Query: q (Titel oder PID), limit (max. 200), offset.
 */
import type { RecordRow } from '#shared/types/domain'
import { db } from '../../../../db'
import { countRecords } from '../../../../lib/records'
import { fail, ownedImport } from '../../_lib'
import { toListItem } from '../../../records/_record'

const MAX_LIMIT = 200

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const sql = db()

  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  const rawLimit = Number(query.limit ?? 50)
  const rawOffset = Number(query.offset ?? 0)
  if (!Number.isFinite(rawLimit) || !Number.isFinite(rawOffset) || rawOffset < 0) {
    throw fail(400, 'paging_invalid', {}, 'Ungueltige Blaetterangabe.')
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)))
  const offset = Math.trunc(rawOffset)

  const total = await countRecords(sql, row.id)

  // ILIKE mit escapten Platzhaltern: ein Titel mit % oder _ soll sich suchen
  // lassen, nicht zum Suchmuster werden.
  const pattern = `%${q.replace(/([\\%_])/g, '\\$1')}%`

  const rows = q === ''
    ? await sql<RecordRow[]>`
        SELECT * FROM records WHERE import_id = ${row.id}
         ORDER BY id LIMIT ${limit} OFFSET ${offset}`
    : await sql<RecordRow[]>`
        SELECT * FROM records
         WHERE import_id = ${row.id}
           AND (work_title ILIKE ${pattern} ESCAPE '\' OR coalesce(avefi_pid,'') ILIKE ${pattern} ESCAPE '\')
         ORDER BY id LIMIT ${limit} OFFSET ${offset}`

  const filtered = q === ''
    ? total
    : Number(
        (
          await sql<Array<{ n: string }>>`
            SELECT COUNT(*) AS n FROM records
             WHERE import_id = ${row.id}
               AND (work_title ILIKE ${pattern} ESCAPE '\' OR coalesce(avefi_pid,'') ILIKE ${pattern} ESCAPE '\')`
        )[0]?.n ?? 0
      )

  const edited = Number(
    (
      await sql<Array<{ n: string }>>`
        SELECT COUNT(*) AS n FROM records WHERE import_id = ${row.id} AND edited_at IS NOT NULL`
    )[0]?.n ?? 0
  )

  return {
    import: {
      id: row.id,
      filename: row.filename,
      base_format: row.base_format,
      detected_format: row.detected_format,
      format_detail: row.format_detail ?? null,
      status: row.status,
      sheet_name: row.sheet_name,
      record_count: row.record_count
    },
    records: rows.map(toListItem),
    total,
    filtered,
    edited,
    limit,
    offset,
    query: q
  }
})
