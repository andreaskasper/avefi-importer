/*
 * POST /api/users — ein Konto anlegen (nur Administratorinnen).
 *
 * Ohne mitgegebenes Passwort erzeugt der Server ein Einmalpasswort und gibt es
 * genau einmal zurueck. Es wird nicht protokolliert und ist danach nur noch als
 * Hash vorhanden.
 */
import { z } from 'zod'
import { db } from '../../db'
import { hashPassword } from '../../lib/users'
import { requireAdmin } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { checkEmail, checkInstitution, checkName, checkPassword, findUser, generatePassword } from './_lib'

const Body = z.object({
  email: z.string(),
  name: z.string(),
  password: z.string().optional(),
  institutionId: z.number().int().nullable().default(null),
  isAdmin: z.boolean().default(false)
})

export default defineEventHandler(async (event) => {
  noStore(event)
  await requireAdmin(event)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'user_body_invalid', {}, 'Eingabe unvollstaendig.')

  const email = checkEmail(parsed.data.email)
  const name = checkName(parsed.data.name)
  const sql = db()
  const institutionId = await checkInstitution(sql, parsed.data.institutionId)

  const generated = parsed.data.password === undefined || parsed.data.password === ''
  const password = generated ? generatePassword() : checkPassword(parsed.data.password ?? '')

  const taken = await sql<Array<{ id: number }>>`SELECT id FROM users WHERE lower(email) = lower(${email})`
  if (taken.length > 0) throw fail(409, 'user_email_taken', { email }, 'Adresse bereits vergeben.')

  const hash = await hashPassword(password)
  const rows = await sql<Array<{ id: number }>>`
    INSERT INTO users (email, name, password_hash, institution_id, is_admin, active)
    VALUES (${email}, ${name}, ${hash}, ${institutionId}, ${parsed.data.isAdmin}, true)
    RETURNING id`
  const id = rows[0]?.id
  if (id === undefined) throw fail(500, 'user_create_failed', {}, 'Konto konnte nicht angelegt werden.')

  return {
    ok: true,
    user: await findUser(sql, id),
    // Nur hier und nur einmal. Danach steht nirgends mehr Klartext.
    oneTimePassword: password,
    generated
  }
})
