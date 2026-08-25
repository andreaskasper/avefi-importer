/**
 * Nutzer und Passwortpruefung.
 *
 * Die bestehenden Hashes stammen aus PHPs password_hash mit PASSWORD_ARGON2ID.
 * Deshalb wird argon2id gelesen und geschrieben; bcrypt wird nur noch gelesen,
 * damit aeltere Datensaetze sich weiterhin anmelden koennen.
 */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import bcrypt from 'bcryptjs'
import type { UserRow } from '#shared/types/domain'

export interface UserWithHash extends UserRow {
  password_hash: string | null
}

/** PHPs PASSWORD_ARGON2ID-Vorgaben, damit erzeugte Hashes dort lesbar blieben. */
const ARGON_OPTS = { memoryCost: 65536, timeCost: 4, parallelism: 1 } as const

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTS)
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  try {
    if (stored.startsWith('$argon2')) return await argonVerify(stored, plain)
    if (stored.startsWith('$2')) {
      // PHP schreibt $2y$, bcryptjs erwartet $2a$/$2b$ — semantisch identisch.
      return await bcrypt.compare(plain, stored.replace(/^\$2y\$/, '$2b$'))
    }
  } catch {
    return false
  }
  return false
}

/** Gleicht die Antwortzeit an einen echten Vergleich an (erschwert Nutzer-Enumeration). */
export async function dummyVerify(plain: string): Promise<void> {
  try {
    await argonVerify(
      '$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG',
      plain
    )
  } catch {
    /* egal — es geht nur um die Zeit */
  }
}
