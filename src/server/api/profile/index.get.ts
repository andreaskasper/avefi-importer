/*
 * GET /api/profile — das eigene Konto.
 */
import { db } from '../../db'
import { requireUser } from '../../utils/session'
import { noStore } from '../imports/_lib'
import { MIN_PASSWORD_LENGTH } from '../users/_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const user = await requireUser(event)
  const sql = db()
  const rows = await sql<Array<{ name: string | null }>>`
    SELECT name FROM institutions WHERE id = ${user.institution_id ?? -1}`
  return {
    user: { ...user, institution_name: rows[0]?.name ?? null },
    minPasswordLength: MIN_PASSWORD_LENGTH
  }
})
