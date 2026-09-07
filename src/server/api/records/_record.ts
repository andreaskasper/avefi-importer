/*
 * Gemeinsames fuer Datensatz-Endpunkte: data_json auslesen, Anzeigefelder ableiten.
 *
 * data_json haelt den vollstaendigen AVefi-Satz samt Herkunft. Die Endpunkte
 * lesen ihn defensiv: Ein Altdatensatz aus dem PHP-Betrieb kann Felder fehlen
 * lassen, und daran darf keine Liste scheitern.
 */
import type { AvefiNode, AvefiRecord, RecordRow, ValidationIssue } from '#shared/types/domain'
import type { SourceInfo } from '../../lib/converters/types'
import { completenessIssues, coreScore, ringClass } from '../../lib/mapping/index'
import { fail } from '../imports/_lib'

function asNode(v: unknown): AvefiNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as AvefiNode) : { category: '' }
}

function asNodes(v: unknown): AvefiNode[] {
  return Array.isArray(v) ? v.filter((n) => typeof n === 'object' && n !== null).map((n) => n as AvefiNode) : []
}

/** Der AVefi-Satz einer Zeile — work/manifestations/items, immer vollstaendig besetzt. */
export function canonicalOf(row: RecordRow): AvefiRecord {
  const data = (typeof row.data_json === 'object' && row.data_json !== null ? row.data_json : {}) as Record<string, unknown>
  const avefi = (typeof data.avefi === 'object' && data.avefi !== null ? data.avefi : data) as Record<string, unknown>
  return {
    work: asNode(avefi.work),
    manifestations: asNodes(avefi.manifestations),
    items: asNodes(avefi.items)
  }
}

/** Die Herkunftsangabe der Zeile; sie bleibt beim Speichern erhalten. */
export function sourceOf(row: RecordRow, fallbackFile: string): SourceInfo {
  const data = (typeof row.data_json === 'object' && row.data_json !== null ? row.data_json : {}) as Record<string, unknown>
  const raw = (typeof data.source === 'object' && data.source !== null && !Array.isArray(data.source)
    ? data.source
    : {}) as Record<string, unknown>
  const out: SourceInfo = { file: typeof raw.file === 'string' ? raw.file : fallbackFile }
  if (typeof raw.row === 'number') out.row = raw.row
  else if (row.source_row !== null) out.row = row.source_row
  if (Array.isArray(raw.rows)) out.rows = raw.rows.filter((n): n is number => typeof n === 'number')
  if (typeof raw.profile === 'number') out.profile = raw.profile
  return out
}

/** Namen aller Beteiligten des Werks, fuer die Zeile in der Liste. */
export function contributorsOf(record: AvefiRecord): string[] {
  const out: string[] = []
  const events = record.work.has_event
  if (!Array.isArray(events)) return out
  for (const ev of events) {
    const activities = (ev as Record<string, unknown>).has_activity
    if (!Array.isArray(activities)) continue
    for (const act of activities) {
      const agents = (act as Record<string, unknown>).has_agent
      if (!Array.isArray(agents)) continue
      for (const agent of agents) {
        const name = String((agent as Record<string, unknown>).has_name ?? '').trim()
        if (name !== '' && !out.includes(name)) out.push(name)
      }
    }
  }
  return out
}

export interface RecordListItem {
  id: number
  title: string | null
  year: number | null
  type: string | null
  pid: string | null
  manifestations: number
  items: number
  completeness: number
  /**
   * Belegte Kernfelder statt eines Prozentwerts: benannte Angaben, keine
   * Bewertung der Daten eines Hauses.
   */
  core: { filled: number; total: number; missing: string[] }
  ring: string
  contributors: string[]
  sourceRow: number | null
  editedAt: string | null
  /** Pflichtangaben des Schemas, die im Datensatz fehlen. Keine Schemapruefung —
   *  die laeuft beim Dienst — sondern die vier Merkmale, ohne die nichts geht. */
  missing: string[]
}

export function toListItem(row: RecordRow): RecordListItem {
  const record = canonicalOf(row)
  const missing = completenessIssues(record).filter((i) => i.level === 'error').map((i) => i.code)
  return {
    id: row.id,
    title: row.work_title,
    year: row.work_year,
    type: row.work_type,
    pid: row.avefi_pid,
    manifestations: row.manifestation_count,
    items: row.item_count,
    completeness: row.completeness,
    core: coreScore(record),
    ring: ringClass(row.completeness),
    contributors: contributorsOf(record).slice(0, 6),
    sourceRow: row.source_row,
    editedAt: row.edited_at,
    missing
  }
}


/* --------------------------------------------- Anreichern ist keine Umwandlung */

/**
 * Eine bestaetigte Normdaten-Zuordnung haengt als same_as an der Entitaet. Sie
 * ersetzt niemals has_name.
 *
 * Im PHP-Stand stand deshalb einmal eine GND-Nummer im Namensfeld, und der
 * Kunde meldete es. Diese Pruefung faengt genau das ab: sieht ein Name wie eine
 * blosse Kennung aus, ist das eine Beanstandung — kein Schemafehler (das Schema
 * erlaubt jede Zeichenkette), aber fachlich falsch.
 */
const BARE_ID = [
  /^\d{1,9}-[0-9X]$/,          // GND
  /^1[0-9]{6,22}$/,             // GND ohne Pruefziffer / VIAF
  /^[QPL]\d+$/,                // Wikidata
  /^https?:\/\//i             // nackte URI
]

function looksLikeIdentifier(name: string): boolean {
  const v = name.trim()
  return v !== '' && BARE_ID.some((re) => re.test(v))
}

function walkNamed(node: unknown, path: string, hit: (path: string, name: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walkNamed(n, `${path}[${i + 1}]`, hit))
    return
  }
  if (typeof node !== 'object' || node === null) return
  const o = node as Record<string, unknown>
  const name = typeof o.has_name === 'string' ? o.has_name : ''
  if (name !== '' && looksLikeIdentifier(name)) hit(path, name)
  for (const [key, value] of Object.entries(o)) {
    if (key === 'has_name' || key === 'same_as' || key === 'has_identifier') continue
    walkNamed(value, path === '' ? key : `${path}.${key}`, hit)
  }
}

/** Beanstandungen der Art „Kennung im Namensfeld". */
export function authorityInNameIssues(record: AvefiRecord): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const hit = (path: string, name: string): void => {
    out.push({
      severity: 'warning',
      code: 'authority_in_name',
      message: 'Im Namensfeld steht eine Kennung. Normdaten gehoeren nach same_as; has_name bleibt der Name.',
      targetField: path,
      value: name
    })
  }
  walkNamed(record.work, 'work', hit)
  record.manifestations.forEach((m, i) => walkNamed(m, `manifestations[${i + 1}]`, hit))
  record.items.forEach((it, i) => walkNamed(it, `items[${i + 1}]`, hit))
  return out
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
