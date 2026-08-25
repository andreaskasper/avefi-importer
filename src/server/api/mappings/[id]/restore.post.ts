/*
 * POST /api/mappings/:id/restore — eine fruehere Fassung wieder aktivieren.
 *
 * Wiederherstellen loescht nichts: Der aktuelle Stand bleibt als Fassung im
 * Verlauf, die wiederhergestellte wird zur neuen Fassung. Damit ist auch ein
 * versehentliches Wiederherstellen umkehrbar.
 */
import { db } from '../../../db'
import { fail, noStore, ownProfile, updateProfile, versionMapping } from '../_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { user, profile } = await ownProfile(event)
  const sql = db()

  const body = (await readBody(event)) as { version?: unknown }
  const wanted = Number(body?.version ?? 0)
  if (!Number.isInteger(wanted) || wanted <= 0) throw fail(400, 'no_version', {}, 'Keine Fassung angegeben.')

  const mapping = await versionMapping(sql, profile.id, wanted)
  if (mapping === null) throw fail(404, 'version_not_found', { version: wanted }, 'Fassung nicht gefunden.')

  const updated = await updateProfile(sql, profile, mapping, null, user.id)
  return {
    restored: wanted,
    profile: { id: updated.id, name: updated.name, version: updated.version, complete: updated.complete }
  }
})
