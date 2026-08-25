/*
 * DELETE /api/users/:id — ein Konto loeschen (nur Administratorinnen).
 *
 * Importe des Kontos bleiben bestehen; users.id steht in imports mit
 * ON DELETE SET NULL. Ein geloeschtes Konto darf keine Importdaten mitnehmen.
 */
import { db } from '../../db'
import { requireAdmin } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { findUser, userIdOf } from './_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const admin = await requireAdmin(event)
  const sql = db()

  const id = userIdOf(event)
  const user = await findUser(sql, id)
  if (user === null) throw fail(404, 'user_not_found', {}, 'Konto nicht gefunden.')
  if (user.id === admin.id) throw fail(409, 'user_self_delete', {}, 'Das eigene Konto kann sich nicht loeschen.')

  const remaining = await sql<Array<{ n: string }>>`
    SELECT COUNT(*) AS n FROM users WHERE is_admin = true AND active = true AND id <> ${id}`
  if (user.is_admin && Number(remaining[0]?.n ?? 0) === 0) {
    throw fail(409, 'user_last_admin', {}, 'Das ist die letzte aktive Administratorin.')
  }

  await sql`DELETE FROM users WHERE id = ${id}`
  return { ok: true, email: user.email }
})
