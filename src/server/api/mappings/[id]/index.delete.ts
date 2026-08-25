/*
 * DELETE /api/mappings/:id — Profil loeschen.
 *
 * Bereits konvertierte Importe bleiben unveraendert: Sie tragen ihr Ergebnis in
 * der Datenbank, nicht einen Verweis auf das Profil. Kuenftige Lieferungen mit
 * dieser Kopfzeile brauchen wieder eine Zuordnung — das steht in der Rueckfrage.
 */
import { db } from '../../../db'
import { deleteProfile, noStore, ownProfile } from '../_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { profile } = await ownProfile(event)
  const sql = db()
  const rows = await sql<Array<{ n: string }>>`
    SELECT COUNT(*) AS n FROM imports WHERE mapping_profile_id = ${profile.id}`
  await deleteProfile(sql, profile.id)
  return { deleted: profile.id, name: profile.name, imports: Number(rows[0]?.n ?? 0) }
})
