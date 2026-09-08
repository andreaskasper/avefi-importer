/*
 * GET /api/imports/:id/records/:recordId — ein Datensatz zum Bearbeiten.
 *
 * Geliefert wird der AVefi-Satz so, wie er gespeichert ist — nicht eine
 * aufbereitete Teilmenge. Was der Editor nicht als Feld anbietet, bleibt in
 * "work"/"manifestations"/"items" erhalten und geht beim Speichern nicht
 * verloren.
 */
import { db } from '../../../../db'
import { findRecord } from '../../../../lib/records'
import { completenessIssues, coreScore, coreState } from '../../../../lib/mapping/index'
import type { RecordDetailResponse } from '#shared/types/domain'
import { fail, ownedImport } from '../../_lib'
import { canonicalOf, contributorsOf } from '../../../records/_record'

export default defineEventHandler(async (event): Promise<RecordDetailResponse> => {
  const { row } = await ownedImport(event)

  const recordId = Number(getRouterParam(event, 'recordId'))
  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw fail(404, 'record_not_found', {}, 'Datensatz nicht gefunden.')
  }

  const record = await findRecord(db(), recordId, row.id)
  if (record === null) throw fail(404, 'record_not_found', {}, 'Datensatz nicht gefunden.')

  const avefi = canonicalOf(record)

  // Nachbarn fuer das Blaettern im Editor: ohne sie muss man fuer jeden
  // naechsten Satz zurueck in die Liste.
  const sql = db()
  const neighbours = await sql<Array<{ prev: number | null; next: number | null }>>`
    SELECT (SELECT max(id) FROM records WHERE import_id = ${row.id} AND id < ${recordId}) AS prev,
           (SELECT min(id) FROM records WHERE import_id = ${row.id} AND id > ${recordId}) AS next`

  return {
    import: {
      id: row.id,
      filename: row.filename,
      base_format: row.base_format,
      status: row.status
    },
    record: {
      id: record.id,
      title: record.work_title,
      year: record.work_year,
      type: record.work_type,
      pid: record.avefi_pid,
      completeness: record.completeness,
      core: coreScore(avefi),
      coreState: coreState(avefi),
      sourceRow: record.source_row,
      editedAt: record.edited_at,
      createdAt: record.created_at,
      contributors: contributorsOf(avefi)
    },
    avefi,
    hints: completenessIssues(avefi),
    prev: neighbours[0]?.prev ?? null,
    next: neighbours[0]?.next ?? null
  }
})
