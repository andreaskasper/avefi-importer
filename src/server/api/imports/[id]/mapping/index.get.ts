/*
 * GET /api/imports/:id/mapping — alles, womit der Editor startet.
 *
 * Die Nutzlast entsteht in server/api/mappings/_lib.ts und ist dieselbe wie am
 * gespeicherten Profil. Unterschiedlich sind nur der Endpunkt, das Subjekt und
 * die Frage, ob am Ende konvertiert werden darf.
 */
import { db } from '../../../../db'
import { editorPayload, findOwnProfile, institutionName, noStore } from '../../../mappings/_lib'
import { importSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { user, row, source } = await importSource(event)
  const sql = db()

  const profile = await findOwnProfile(sql, user.institution_id, source.headerHash)
  const payload = await editorPayload(sql, {
    mode: 'import',
    endpoint: `/api/imports/${row.id}/mapping`,
    subject: row.filename,
    canStart: true,
    source,
    profile,
    user,
    institutionName: await institutionName(sql, user.institution_id),
    withColumnReport: true
  })

  return {
    import: { id: row.id, filename: row.filename, status: row.status, base_format: row.base_format },
    payload
  }
})
