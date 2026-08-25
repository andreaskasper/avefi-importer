/*
 * Gemeinsames fuer die Formatpruefung.
 *
 * Eine Aufgabe ist nicht eine Zeile in format_reviews, sondern eine Kopfzeile
 * eines Hauses: Institution + Fingerabdruck. Im PHP-Stand wurde nur je Import
 * entdoppelt — zwanzig Dateien mit derselben unbekannten Kopfzeile erzeugten
 * zwanzig gleichlautende Aufgaben. In der Datenbank stehen aus dieser Zeit noch
 * mehrfache offene Eintraege (etwa #11 und #12 zum selben Hash); die Anzeige
 * fasst sie zusammen, statt daran zu scheitern.
 */
import type { H3Event } from 'h3'
import type { Sql } from 'postgres'
import type { UserRow } from '#shared/types/domain'
import { requireUser } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'

export interface ReviewRow {
  id: number
  import_id: string
  fingerprint: string
  status: string
  sample_json: unknown
  created_at: string
  filename: string
  base_format: string | null
  header_hash: string | null
  import_status: string
  institution_id: number
  institution_name: string | null
  uploaded_at: string
}

/** Offene Pruefungen im Sichtbereich des Kontos, aelteste zuerst. */
export async function openReviews(sql: Sql, user: UserRow): Promise<ReviewRow[]> {
  if (user.is_admin) {
    return sql<ReviewRow[]>`
      SELECT fr.id, fr.import_id, fr.fingerprint, fr.status, fr.sample_json, fr.created_at,
             i.filename, i.base_format, i.header_hash, i.status AS import_status,
             i.institution_id, i.created_at AS uploaded_at, inst.name AS institution_name
        FROM format_reviews fr
        JOIN imports i ON i.id = fr.import_id
        LEFT JOIN institutions inst ON inst.id = i.institution_id
       WHERE fr.status = 'open'
       ORDER BY fr.id`
  }
  return sql<ReviewRow[]>`
    SELECT fr.id, fr.import_id, fr.fingerprint, fr.status, fr.sample_json, fr.created_at,
           i.filename, i.base_format, i.header_hash, i.status AS import_status,
           i.institution_id, i.created_at AS uploaded_at, inst.name AS institution_name
      FROM format_reviews fr
      JOIN imports i ON i.id = fr.import_id
      LEFT JOIN institutions inst ON inst.id = i.institution_id
     WHERE fr.status = 'open' AND i.institution_id = ${user.institution_id ?? -1}
     ORDER BY fr.id`
}

export async function findReview(sql: Sql, id: number): Promise<ReviewRow | null> {
  const rows = await sql<ReviewRow[]>`
    SELECT fr.id, fr.import_id, fr.fingerprint, fr.status, fr.sample_json, fr.created_at,
           i.filename, i.base_format, i.header_hash, i.status AS import_status,
           i.institution_id, i.created_at AS uploaded_at, inst.name AS institution_name
      FROM format_reviews fr
      JOIN imports i ON i.id = fr.import_id
      LEFT JOIN institutions inst ON inst.id = i.institution_id
     WHERE fr.id = ${id}`
  return rows[0] ?? null
}

/** Alle offenen Pruefungen derselben Aufgabe — gleiches Haus, gleiche Kopfzeile. */
export async function siblingsOf(sql: Sql, review: ReviewRow): Promise<ReviewRow[]> {
  return sql<ReviewRow[]>`
    SELECT fr.id, fr.import_id, fr.fingerprint, fr.status, fr.sample_json, fr.created_at,
           i.filename, i.base_format, i.header_hash, i.status AS import_status,
           i.institution_id, i.created_at AS uploaded_at, inst.name AS institution_name
      FROM format_reviews fr
      JOIN imports i ON i.id = fr.import_id
      LEFT JOIN institutions inst ON inst.id = i.institution_id
     WHERE fr.status = 'open'
       AND fr.fingerprint = ${review.fingerprint}
       AND i.institution_id = ${review.institution_id}
     ORDER BY fr.id`
}

export interface ReviewFile {
  reviewId: number
  importId: string
  filename: string
  uploadedAt: string
  importStatus: string
}

export interface ReviewTask {
  /** Die aelteste offene Pruefung der Gruppe; unter ihrer Nummer wird bearbeitet. */
  id: number
  fingerprint: string
  shortFingerprint: string
  baseFormat: string | null
  institutionId: number
  institutionName: string | null
  importId: string
  filename: string
  uploadedAt: string
  columns: number
  /** Wie viele Dateien auf dieselbe Entscheidung warten. */
  waiting: number
  files: ReviewFile[]
}

export function sampleColumns(sample: unknown): string[] {
  if (typeof sample !== 'object' || sample === null) return []
  const cols = (sample as Record<string, unknown>).columns
  return Array.isArray(cols) ? cols.map((c) => String(c)) : []
}

function fileOf(row: ReviewRow): ReviewFile {
  return {
    reviewId: row.id,
    importId: row.import_id,
    filename: row.filename,
    uploadedAt: row.uploaded_at,
    importStatus: row.import_status
  }
}

/** Zeilen zu Aufgaben zusammenfassen: eine je Institution und Kopfzeilen-Hash. */
export function groupReviews(rows: readonly ReviewRow[]): ReviewTask[] {
  const byKey = new Map<string, ReviewTask>()
  for (const row of rows) {
    const key = `${row.institution_id} ${row.fingerprint}`
    const found = byKey.get(key)
    if (found !== undefined) {
      found.waiting++
      found.files.push(fileOf(row))
      continue
    }
    byKey.set(key, {
      id: row.id,
      fingerprint: row.fingerprint,
      shortFingerprint: row.fingerprint.slice(0, 16),
      baseFormat: row.base_format,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      importId: row.import_id,
      filename: row.filename,
      uploadedAt: row.uploaded_at,
      columns: sampleColumns(row.sample_json).length,
      waiting: 1,
      files: [fileOf(row)]
    })
  }
  return [...byKey.values()]
}

/** Nur Administratorinnen entscheiden ueber unbekannte Formate. */
export async function requireReviewer(event: H3Event): Promise<UserRow> {
  noStore(event)
  const user = await requireUser(event)
  if (!user.is_admin) throw fail(403, 'reviews_admin_only', {}, 'Nur Administratorinnen.')
  return user
}

export function reviewIdOf(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw fail(404, 'review_not_found', {}, 'Pruefung nicht gefunden.')
  return id
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
