/*
 * GET /api/imports/:id/avefi.json — die erzeugte AVefi-Datei.
 *
 * Ein Stand, der nicht gegen das Schema geprueft ist, geht trotzdem heraus:
 * Zur Fehlersuche braucht man genau ihn. Er wird aber eindeutig gekennzeichnet
 * — im Dateinamen, im Kopf der Antwort und in der Oberflaeche —, damit er
 * nicht versehentlich als Lieferung weitergereicht wird.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { avefiPath } from '../../../lib/storage'
import type { ExtendedImportReport } from '../../../lib/imports'
import { fail, ownedImport } from '../_lib'

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const path = avefiPath(row.id)

  const info = await stat(path).catch(() => null)
  if (info === null || info.size === 0) {
    throw fail(404, 'no_avefi', {}, 'Noch keine AVefi-Datei vorhanden.')
  }

  const report = (row.report_json ?? null) as ExtendedImportReport | null
  const errors = (report?.issues ?? []).filter((i) => i.severity === 'error').length
  const validated = row.status === 'converted' && errors === 0

  const name = validated
    ? `avefi-${row.id}.json`
    : `avefi-${row.id}.NICHT-VALIDIERT.json`

  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-length', String(info.size))
  setHeader(event, 'content-disposition', `attachment; filename="${name}"`)
  // Maschinenlesbare Kennzeichnung fuer alles, was die Datei weiterverarbeitet.
  setHeader(event, 'x-avefi-validated', validated ? 'true' : 'false')
  setHeader(event, 'x-avefi-import', row.id)
  return sendStream(event, createReadStream(path))
})
