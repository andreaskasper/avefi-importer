/*
 * GET /api/users — Nutzerkonten und Institutionen (nur Administratorinnen).
 */
import { db } from '../../db'
import { requireAdmin } from '../../utils/session'
import { noStore } from '../imports/_lib'
import { listInstitutions, listUsers, MIN_PASSWORD_LENGTH } from './_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const admin = await requireAdmin(event)
  const sql = db()
  return {
    users: await listUsers(sql),
    institutions: await listInstitutions(sql),
    selfId: admin.id,
    minPasswordLength: MIN_PASSWORD_LENGTH
  }
})
