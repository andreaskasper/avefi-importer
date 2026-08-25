/*
 * POST /api/profile/password — das eigene Passwort aendern.
 *
 * Das alte Passwort wird verlangt: Eine offen liegengelassene Sitzung soll kein
 * Kontoverlust werden. Vier Fehlerlagen, vier Meldungen — falsches altes
 * Passwort, zu kurzes neues, Bestaetigung stimmt nicht, altes gleich neu.
 * Keine davon nennt oder protokolliert ein Passwort.
 */
import { z } from 'zod'
import { db } from '../../db'
import { hashPassword, verifyPassword, type UserWithHash } from '../../lib/users'
import { requireUser } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { MIN_PASSWORD_LENGTH } from '../users/_lib'

const Body = z.object({
  current: z.string(),
  next: z.string(),
  confirm: z.string()
})

export default defineEventHandler(async (event) => {
  noStore(event)
  const user = await requireUser(event)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'profile_body_invalid', {}, 'Eingabe unvollstaendig.')
  const { current, next, confirm } = parsed.data

  const sql = db()
  const rows = await sql<UserWithHash[]>`SELECT * FROM users WHERE id = ${user.id}`
  const stored = rows[0]
  if (stored === undefined) throw fail(404, 'user_not_found', {}, 'Konto nicht gefunden.')

  if (!(await verifyPassword(current, stored.password_hash))) {
    throw fail(403, 'password_current_wrong', {}, 'Das aktuelle Passwort stimmt nicht.')
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw fail(400, 'password_too_short', { min: MIN_PASSWORD_LENGTH }, 'Neues Passwort zu kurz.')
  }
  if (next !== confirm) {
    throw fail(400, 'password_mismatch', {}, 'Die Bestaetigung stimmt nicht.')
  }
  if (next === current) {
    throw fail(400, 'password_unchanged', {}, 'Das neue Passwort ist das alte.')
  }

  await sql`UPDATE users SET password_hash = ${await hashPassword(next)} WHERE id = ${user.id}`
  return { ok: true }
})
