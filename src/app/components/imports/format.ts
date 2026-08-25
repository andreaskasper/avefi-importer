/*
 * Zahlen und Zeitpunkte fuer die Anzeige.
 *
 * Postgres liefert Zeitstempel als "2026-08-25 13:08:51.268+00". Das ist kein
 * gueltiges ISO-8601 fuer den Browser: Es fehlt das T, und die Zeitzone hat nur
 * zwei Stellen. Ohne Umformung entsteht ein ungueltiges Datum — und daraus in
 * der Liste ein leeres Feld.
 */
import type { FormatDetail } from '#shared/types/domain'

export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalised = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  const date = new Date(normalised)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: string | null | undefined, locale: string, timeZone?: string): string {
  const date = parseTimestamp(value)
  if (date === null) return ''
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone })
  }).format(date)
}

export function formatMegabytes(bytes: number, locale: string): string {
  if (!bytes || bytes <= 0) return ''
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    bytes / 1048576
  )
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * Dateigroesse mit passender Einheit.
 *
 * Unter einem Megabyte in Kilobyte: „0,0 MB" fuer eine Tabelle mit achttausend
 * Byte sagt nichts, ausser dass gerundet wurde.
 */
export function fileSize(bytes: number, locale: string): { key: string; params: Record<string, string> } | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1048576) {
    return {
      key: 'imports.table.kilobytes',
      params: { size: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1024) }
    }
  }
  return { key: 'imports.table.megabytes', params: { size: formatMegabytes(bytes, locale) } }
}

/**
 * Formathinweis als Uebersetzungsauftrag statt als fertiger Satz.
 *
 * Der Server liefert die Bestandteile (Format, Blattname, Spalten- bzw.
 * Blattzahl); der Satz entsteht hier aus einem i18n-Schluessel. Fehlen die
 * Bestandteile — Importe aus der Zeit davor haben nur den deutschen Text in
 * detected_format —, gibt die Funktion null zurueck und der Rueckfall greift.
 */
export function formatDetailLabel(
  detail: FormatDetail | null | undefined
): { key: string; params: Record<string, string | number>; count: number } | null {
  if (!detail || typeof detail.format !== 'string' || detail.format === '') return null
  const format = detail.format

  if (typeof detail.sheets === 'number') {
    return { key: 'imports.format.sheets', params: { format, count: detail.sheets }, count: detail.sheets }
  }
  if (typeof detail.sheet === 'string' && detail.sheet !== '') {
    if (typeof detail.columns === 'number') {
      return {
        key: 'imports.format.sheetColumns',
        params: { format, sheet: detail.sheet, count: detail.columns },
        count: detail.columns
      }
    }
    return { key: 'imports.format.sheet', params: { format, sheet: detail.sheet }, count: 1 }
  }
  if (typeof detail.columns === 'number') {
    return { key: 'imports.format.columns', params: { format, count: detail.columns }, count: detail.columns }
  }
  return { key: 'imports.format.plain', params: { format }, count: 1 }
}
