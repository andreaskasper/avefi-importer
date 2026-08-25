/*
 * GET /api/users/:id — ein Konto (nur Administratorinnen).
 */
import { db } from '../../db'
import { requireAdmin } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { findUser, listInstitutions, MIN_PASSWORD_LENGTH, userIdOf } from './_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const admin = await requireAdmin(event)
  const sql = db()

  const id = userIdOf(event)
  const user = await findUser(sql, id)
  if (user === null) throw fail(404, 'user_not_found', {}, 'Konto nicht gefunden.')

  return {
    user,
    institutions: await listInstitutions(sql),
    isSelf: user.id === admin.id,
    minPasswordLength: MIN_PASSWORD_LENGTH
  }
})
