import { z } from 'zod'
import { db } from '../../db'
import { session } from '../../utils/session'
import { verifyPassword, dummyVerify, type UserWithHash } from '../../lib/users'

const Body = z.object({ email: z.string().min(1), password: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Ungueltige Eingabe.' })
  const { email, password } = parsed.data

  const sql = db()
  const rows = await sql<UserWithHash[]>`
    SELECT * FROM users WHERE lower(email) = lower(${email}) AND active = true LIMIT 1`
  const user = rows[0]

  if (!user) {
    await dummyVerify(password)
    throw createError({ statusCode: 401, statusMessage: 'Anmeldung fehlgeschlagen.' })
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    throw createError({ statusCode: 401, statusMessage: 'Anmeldung fehlgeschlagen.' })
  }

  const s = await session(event)
  await s.clear()
  await s.update({ userId: user.id })
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`

  return { ok: true, user: { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin } }
})
