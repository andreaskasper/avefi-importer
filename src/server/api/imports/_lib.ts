/*
 * Gemeinsames fuer die Import-Endpunkte: Fehlerform, Besitzpruefung, Dateiendungen.
 *
 * Die Datei liegt unter server/api/, weil dort die Endpunkte liegen. Nitro macht
 * aus jeder Datei in server/api/ eine Route, also traegt sie einen
 * Vorgabe-Handler, der 404 liefert — sonst quittiert der Server den Aufruf von
 * /api/imports/_lib mit einem Serverfehler.
 *
 * Fehler tragen immer einen Code in data.code. Die Oberflaeche uebersetzt ihn;
 * statusMessage ist nur die Rueckfallebene fuer Werkzeuge ohne Uebersetzung.
 * Eine pauschale Meldung gibt es nicht: Jede Lage hat ihren eigenen Code und
 * damit ihren eigenen Satz.
 */
import type { H3Event } from 'h3'
import type { BaseFormat, ImportRow, UserRow } from '#shared/types/domain'
import { db } from '../../db'
import { requireUser } from '../../utils/session'
import { findImport } from '../../lib/imports'

/** Groesster zulaessiger Upload ueber die Oberflaeche. */
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1048576)

/** Endung -> Basisformat. Was hier nicht steht, wird nicht angenommen. */
export const UPLOAD_EXTENSIONS: Record<string, BaseFormat> = {
  csv: 'csv',
  tsv: 'tsv',
  tab: 'tsv',
  xlsx: 'xlsx',
  xlsm: 'xlsx',
  xltx: 'xlsx',
  xml: 'xml',
  ead: 'ead',
  marcxml: 'marcxml',
  marc: 'marcxml',
  json: 'json'
}

/**
 * Arbeitsmappenformate, die erkannt, aber nicht gelesen werden. Sie bekommen
 * eine eigene Meldung mit dem Ausweg, statt in der Sammelmeldung unterzugehen.
 */
export const REJECTED_WORKBOOKS: Record<string, string> = {
  xls: 'workbook_unsupported_xls',
  ods: 'workbook_unsupported_ods'
}

export interface FailData {
  code: string
  [k: string]: unknown
}

/** Fehler mit uebersetzbarem Code. */
export function fail(statusCode: number, code: string, extra: Record<string, unknown> = {}, message?: string) {
  return createError({
    statusCode,
    statusMessage: message ?? code,
    data: { code, ...extra } satisfies FailData
  })
}

export type UserWithInstitution = UserRow & { institution_id: number }

/**
 * Antworten mit Daten einer Institution duerfen nirgends zwischengespeichert
 * werden — weder im Browser noch in einem vorgelagerten Netz.
 *
 * Der Anlass ist kein theoretischer: Unter der oeffentlichen Adresse lieferte
 * der vorgeschaltete Zwischenspeicher die Importliste eines angemeldeten Hauses
 * an eine Anfrage ganz ohne Sitzung aus (cf-cache-status: HIT). Fuer die
 * HTML-Seiten gehoert die Abhilfe in die Konfiguration; fuer die Endpunkte hier
 * steht sie in der Antwort selbst.
 */
export function noStore(event: H3Event): void {
  setHeader(event, 'cache-control', 'no-store, private, max-age=0')
  setHeader(event, 'vary', 'cookie')
}

/** Angemeldet und einer Institution zugeordnet — sonst gibt es nichts zu importieren. */
export async function requireInstitution(event: H3Event): Promise<UserWithInstitution> {
  noStore(event)
  const user = await requireUser(event)
  if (user.institution_id === null) {
    throw fail(409, 'no_institution', {}, 'Konto ohne Institution.')
  }
  return user as UserWithInstitution
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function importIdOf(event: H3Event): string {
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!UUID.test(id)) throw fail(404, 'not_found', {}, 'Import nicht gefunden.')
  return id
}

/**
 * Der Import, sofern er der Institution des Nutzers gehoert.
 * Administratorinnen sehen auch fremde — sonst laesst sich eine Formatpruefung
 * nicht bearbeiten.
 */
export async function ownedImport(event: H3Event): Promise<{ user: UserRow; row: ImportRow }> {
  noStore(event)
  const user = await requireUser(event)
  const id = importIdOf(event)
  const row = await findImport(db(), id)
  if (row === null) throw fail(404, 'not_found', {}, 'Import nicht gefunden.')
  if (!user.is_admin && row.institution_id !== user.institution_id) {
    throw fail(404, 'not_found', {}, 'Import nicht gefunden.')
  }
  return { user, row }
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/**
 * Basisformat aus der Endung — und aussagekraeftige Fehler, wenn es keins gibt.
 * Geprueft wird vor dem Speichern: Eine Datei, die niemand lesen kann, hat auf
 * der Platte nichts verloren.
 */
export function baseFormatForUpload(filename: string): BaseFormat {
  const ext = extensionOf(filename)
  if (ext === '') throw fail(415, 'no_extension', {}, 'Datei ohne Endung.')
  const rejected = REJECTED_WORKBOOKS[ext]
  if (rejected) throw fail(415, rejected, { ext }, `Format .${ext} wird nicht gelesen.`)
  const base = UPLOAD_EXTENSIONS[ext]
  if (!base) throw fail(415, 'format_unsupported', { ext }, `Format .${ext} wird nicht unterstuetzt.`)
  return base
}

/**
 * Grundlegende Absicherung gegen Abrufe im eigenen Netz (SSRF).
 * Geprueft wird der Hostname; die endgueltige Pruefung macht der Worker beim
 * Abruf noch einmal, weil eine Umleitung anderswohin fuehren kann.
 */
export function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw fail(400, 'url_invalid', {}, 'Keine gueltige Adresse.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw fail(400, 'url_scheme', { scheme: url.protocol }, 'Nur http und https.')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const isPrivate =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host)
  if (isPrivate) throw fail(400, 'url_private', { host }, 'Adresse zeigt ins private Netz.')
  return url
}

/** Dateiname aus einer Adresse — ohne ihn liesse sich das Format nicht raten. */
export function filenameFromUrl(url: URL): string {
  const path = url.pathname
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name !== '' ? decodeURIComponent(name) : 'download'
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
