/*
 * POST /api/users/:id/password — Passwort neu setzen (nur Administratorinnen).
 *
 * Es gibt keinen Mailversand. Deshalb erzeugt der Server ein Einmalpasswort und
 * zeigt es genau einmal an; die Administratorin gibt es weiter. Ein selbst
 * gewaehltes Passwort ist erlaubt, aber nicht der Regelweg.
 *
 * Weder das erzeugte noch das gewaehlte Passwort wird protokolliert.
 */
import { z } from 'zod'
import { db } from '../../../db'
import { hashPassword } from '../../../lib/users'
import { requireAdmin } from '../../../utils/session'
import { fail, noStore } from '../../imports/_lib'
import { checkPassword, findUser, generatePassword, userIdOf } from '../_lib'

const Body = z.object({ password: z.string().optional() })

export default defineEventHandler(async (event) => {
  noStore(event)
  await requireAdmin(event)
  const sql = db()

  const id = userIdOf(event)
  const user = await findUser(sql, id)
  if (user === null) throw fail(404, 'user_not_found', {}, 'Konto nicht gefunden.')

  const parsed = Body.safeParse(await readBody(event).catch(() => ({})))
  const wanted = parsed.success ? (parsed.data.password ?? '') : ''
  const generated = wanted === ''
  const password = generated ? generatePassword() : checkPassword(wanted)

  await sql`UPDATE users SET password_hash = ${await hashPassword(password)} WHERE id = ${id}`

  return { ok: true, email: user.email, oneTimePassword: password, generated }
})
