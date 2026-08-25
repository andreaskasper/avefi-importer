/*
 * GET /api/imports/status — Kurzstand aller Importe der Institution.
 *
 * Damit haelt sich die Liste selbst aktuell, solange etwas laeuft. Im PHP-Stand
 * fehlte das: „In Konvertierung" blieb stehen, bis jemand neu lud, und niemand
 * wusste, ob der Hintergrundprozess noch arbeitet oder laengst fertig ist.
 */
import { db } from '../../db'
import { listImports } from '../../lib/imports'
import { requireInstitution } from './_lib'

const BUSY = new Set(['uploading', 'queued', 'converting'])

export default defineEventHandler(async (event) => {
  const user = await requireInstitution(event)
  const rows = await listImports(db(), user.institution_id)

  const imports: Record<string, { status: string; records: number; errors: number; progress: number }> = {}
  let busy = false
  for (const row of rows) {
    if (BUSY.has(row.status)) busy = true
    imports[row.id] = {
      status: row.status,
      records: row.record_count,
      errors: row.error_count,
      progress: row.upload_progress
    }
  }
  return { busy, count: rows.length, imports }
})
