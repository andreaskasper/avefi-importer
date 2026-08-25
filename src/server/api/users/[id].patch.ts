/*
 * PATCH /api/users/:id — Stammdaten eines Kontos (nur Administratorinnen).
 *
 * Selbstschutz: Das eigene Konto laesst sich weder entmachten noch sperren.
 * Wer sich selbst die Rechte nimmt, kommt nicht mehr an die Nutzerverwaltung —
 * und ohne Mailversand auch nicht mehr zurueck.
 */
import { z } from 'zod'
import { db } from '../../db'
import { requireAdmin } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { checkInstitution, checkName, findUser, userIdOf } from './_lib'

const Body = z.object({
  name: z.string().optional(),
  institutionId: z.number().int().nullable().optional(),
  isAdmin: z.boolean().optional(),
  active: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  noStore(event)
  const admin = await requireAdmin(event)
  const sql = db()

  const id = userIdOf(event)
  const user = await findUser(sql, id)
  if (user === null) throw fail(404, 'user_not_found', {}, 'Konto nicht gefunden.')

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'user_body_invalid', {}, 'Eingabe unvollstaendig.')
  const body = parsed.data
  const isSelf = user.id === admin.id

  if (isSelf && body.isAdmin === false) {
    throw fail(409, 'user_self_demote', {}, 'Das eigene Konto kann sich nicht entmachten.')
  }
  if (isSelf && body.active === false) {
    throw fail(409, 'user_self_lock', {}, 'Das eigene Konto kann sich nicht sperren.')
  }

  const name = body.name === undefined ? user.name : checkName(body.name)
  const institutionId = body.institutionId === undefined
    ? user.institution_id
    : await checkInstitution(sql, body.institutionId)
  const isAdmin = body.isAdmin === undefined ? user.is_admin : body.isAdmin
  const active = body.active === undefined ? user.active : body.active

  await sql`
    UPDATE users
       SET name = ${name}, institution_id = ${institutionId}, is_admin = ${isAdmin}, active = ${active}
     WHERE id = ${id}`

  return { ok: true, user: await findUser(sql, id) }
})
