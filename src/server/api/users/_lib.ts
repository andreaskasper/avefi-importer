/*
 * Gemeinsames fuer die Nutzerverwaltung.
 *
 * Vertraglich reicht eine einfache Demo-Authentifizierung ohne Benutzer-
 * verwaltung. Dass es sie trotzdem gibt, ist Zugabe — sie muss deshalb nicht
 * weniger sorgfaeltig sein, sondern nur nicht mehr koennen als noetig: anlegen,
 * bearbeiten, sperren, loeschen, Passwort neu setzen.
 *
 * Passwoerter werden nie zurueckgegeben und nie protokolliert. Ein neu
 * gesetztes Einmalpasswort erscheint genau einmal in der Antwort auf die
 * Anfrage, die es erzeugt hat — es gibt keinen Mailversand, ueber den es sonst
 * beim Konto ankommen koennte.
 */
import { randomInt } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Sql } from 'postgres'
import type { InstitutionRow, UserRow } from '#shared/types/domain'
import { fail } from '../imports/_lib'

export const MIN_PASSWORD_LENGTH = 12

/**
 * Zeichenvorrat ohne die Paare, die auf Papier und Bildschirm verwechselt
 * werden (0/O, 1/l/I). Ein Einmalpasswort wird abgetippt; jede Verwechslung
 * kostet einen Anruf.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassword(length = 16): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export interface UserWithInstitution extends UserRow {
  institution_name: string | null
}

export async function listUsers(sql: Sql): Promise<UserWithInstitution[]> {
  return sql<UserWithInstitution[]>`
    SELECT u.id, u.institution_id, u.email, u.name, u.is_admin, u.active,
           u.created_at, u.last_login_at, i.name AS institution_name
      FROM users u
      LEFT JOIN institutions i ON i.id = u.institution_id
     ORDER BY lower(u.email)`
}

export async function findUser(sql: Sql, id: number): Promise<UserWithInstitution | null> {
  const rows = await sql<UserWithInstitution[]>`
    SELECT u.id, u.institution_id, u.email, u.name, u.is_admin, u.active,
           u.created_at, u.last_login_at, i.name AS institution_name
      FROM users u
      LEFT JOIN institutions i ON i.id = u.institution_id
     WHERE u.id = ${id}`
  return rows[0] ?? null
}

export async function listInstitutions(sql: Sql): Promise<InstitutionRow[]> {
  return sql<InstitutionRow[]>`SELECT id, name, slug, created_at FROM institutions ORDER BY name`
}

export function userIdOf(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw fail(404, 'user_not_found', {}, 'Konto nicht gefunden.')
  return id
}

/** Nur eine Adresse mit genau einem @ und einem Punkt dahinter. */
export function checkEmail(value: string): string {
  const email = value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw fail(400, 'user_email_invalid', {}, 'Keine gueltige E-Mail-Adresse.')
  }
  return email
}

export function checkName(value: string): string {
  const name = value.trim()
  if (name === '') throw fail(400, 'user_name_missing', {}, 'Kein Name angegeben.')
  return name
}

export function checkPassword(value: string): string {
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw fail(400, 'user_password_short', { min: MIN_PASSWORD_LENGTH }, 'Passwort zu kurz.')
  }
  return value
}

/** Gibt es die Institution ueberhaupt? Eine tote Zuordnung waere schlimmer als keine. */
export async function checkInstitution(sql: Sql, id: number | null): Promise<number | null> {
  if (id === null) return null
  const rows = await sql<Array<{ id: number }>>`SELECT id FROM institutions WHERE id = ${id}`
  if (rows.length === 0) throw fail(400, 'institution_unknown', { id }, 'Institution unbekannt.')
  return id
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
