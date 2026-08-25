/** Sitzungsverwaltung ueber verschluesselte Cookies (h3). */
import type { H3Event } from 'h3'
import type { UserRow } from '#shared/types/domain'
import { db } from '../db'

export interface SessionData {
  userId?: number
  /** Reiner Demo-Zugriffsschutz ohne Nutzerkonto (Vertrag Paragraf 3). */
  demoUnlocked?: boolean
}

function secret(): string {
  // process.env hat Vorrang, siehe Begruendung in server/db/index.ts.
  const s = process.env.SESSION_SECRET || useRuntimeConfig().sessionSecret
  return s.length >= 32 ? s : s.padEnd(32, '0')
}

export function session(event: H3Event) {
  return useSession<SessionData>(event, { password: secret(), name: 'avefi_session' })
}

export async function currentUser(event: H3Event): Promise<UserRow | null> {
  const s = await session(event)
  const id = s.data.userId
  if (!id) return null
  const sql = db()
  const rows = await sql<UserRow[]>`
    SELECT id, institution_id, email, name, is_admin, active, created_at, last_login_at
      FROM users WHERE id = ${id} AND active = true`
  return rows[0] ?? null
}

export async function requireUser(event: H3Event): Promise<UserRow> {
  const u = await currentUser(event)
  if (!u) throw createError({ statusCode: 401, statusMessage: 'Nicht angemeldet.' })
  return u
}

export async function requireAdmin(event: H3Event): Promise<UserRow> {
  const u = await requireUser(event)
  if (!u.is_admin) throw createError({ statusCode: 403, statusMessage: 'Keine Berechtigung.' })
  return u
}
