/*
 * PATCH /api/profile — den eigenen Anzeigenamen aendern.
 *
 * Die E-Mail-Adresse bleibt: Sie ist die Anmeldung. Wer sie aendern darf, kann
 * sich aus dem eigenen Konto aussperren — ohne Mailversand endgueltig.
 */
import { z } from 'zod'
import { db } from '../../db'
import { requireUser } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { checkName } from '../users/_lib'

const Body = z.object({ name: z.string() })

export default defineEventHandler(async (event) => {
  noStore(event)
  const user = await requireUser(event)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'profile_body_invalid', {}, 'Eingabe unvollstaendig.')
  const name = checkName(parsed.data.name)

  const sql = db()
  await sql`UPDATE users SET name = ${name} WHERE id = ${user.id}`
  return { ok: true, name }
})
