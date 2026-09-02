/*
 * Completeness — Vollstaendigkeit eines kanonischen AVefi-Datensatzes und die
 * Belegung der vier Kernfelder.
 *
 * Die Kernfelder — Titel, Regie, Produktionsdatum, Produktionsland — sind der
 * Grund fuer die Zahl "4 von 4": Datensaetze mit allen vier Angaben lassen sich
 * verlaesslich mit den Bestaenden anderer Haeuser abgleichen; bei zweien wird
 * jede Zusammenfuehrung zum Ratespiel.
 */

import type { Severity } from '#shared/types/domain'
import type { AvefiNode, AvefiRecord } from './builder.js'

function asNode(v: unknown): AvefiNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as AvefiNode) : {}
}

function asList(v: unknown): AvefiNode[] {
  return Array.isArray(v) ? (v as AvefiNode[]) : []
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

function hasName(v: unknown): boolean {
  const node = asNode(v)
  return String(node['has_name'] ?? '').trim() !== ''
}

function hasEventDate(events: unknown): boolean {
  return asList(events).some((e) => !isEmpty(e['has_date']))
}

function hasActivities(events: unknown): boolean {
  return asList(events).some((e) => asList(e['has_activity']).length > 0)
}

/* ---------------------------------------------------- Vollstaendigkeitswert */

/** Die acht Merkmale, an denen die Vollstaendigkeit gemessen wird. */
export function completenessChecks(record: AvefiRecord): Array<{ key: string; label: string; filled: boolean }> {
  const w = record.work
  return [
    { key: 'title', label: 'Haupttitel', filled: hasName(w['has_primary_title']) },
    { key: 'type', label: 'Werkart', filled: !isEmpty(w['type']) },
    { key: 'date', label: 'Produktionsjahr', filled: hasEventDate(w['has_event']) },
    { key: 'subject', label: 'Erschliessung', filled: asList(w['has_subject']).length > 0 },
    { key: 'activity', label: 'Beteiligte', filled: hasActivities(w['has_event']) },
    {
      key: 'genre', label: 'Genre oder Form',
      filled: asList(w['has_genre']).length > 0 || (Array.isArray(w['has_form']) && w['has_form'].length > 0)
    },
    { key: 'manifestation', label: 'Manifestation', filled: record.manifestations.length > 0 },
    { key: 'item', label: 'Exemplar', filled: record.items.length > 0 }
  ]
}

/**
 * Vollstaendigkeit in Prozent (0–100).
 *
 * Bleibt als gespeicherter Wert erhalten (Spalte records.completeness, danach
 * wird sortiert), wird aber nicht mehr als Bewertung angezeigt. Was die Liste
 * zeigt, ist coreScore: benannte Angaben statt eines Anteils.
 */
export function completeness(record: AvefiRecord): number {
  const checks = completenessChecks(record)
  const filled = checks.filter((c) => c.filled).length
  return Math.round((filled / checks.length) * 100)
}

/**
 * Wie viele der vier Kernfelder belegt sind, und welche fehlen.
 *
 * Titel, Regie, Produktionsdatum und Produktionsland sind die Angaben, an denen
 * der Abgleich mit den Bestaenden anderer Haeuser haengt. Deshalb "3 von 4" und
 * nicht "75 Prozent": Der Anteil sagt nicht, WELCHE Angabe fehlt, und bewertet
 * die Daten eines Hauses, statt sie zu beschreiben.
 *
 * Gerechnet wird ueber corePresence — dieselbe Stelle, die auch die
 * Belegungsstatistik des Prüfberichts speist.
 */
export function coreScore(record: AvefiRecord): { filled: number; total: number; missing: CoreFieldKey[] } {
  const presence = corePresence(record)
  const keys = Object.keys(CORE_FIELDS) as CoreFieldKey[]
  const missing = keys.filter((k) => !presence[k])
  return { filled: keys.length - missing.length, total: keys.length, missing }
}

/** Hinweise fuer den Datensatz-Editor. */
export function completenessIssues(record: AvefiRecord): Array<{ level: Severity | 'ok'; text: string }> {
  const w = record.work
  const out: Array<{ level: Severity | 'ok'; text: string }> = []

  if (!hasName(w['has_primary_title'])) out.push({ level: 'error', text: 'Haupttitel (has_primary_title) fehlt' })
  if (isEmpty(w['type'])) out.push({ level: 'error', text: 'Werkart (type) fehlt' })
  if (!hasEventDate(w['has_event'])) out.push({ level: 'warning', text: 'Produktionsjahr empfohlen' })
  if (asList(w['has_subject']).length === 0) out.push({ level: 'warning', text: 'Schlagwoerter oder Personen empfohlen' })
  if (!hasActivities(w['has_event'])) out.push({ level: 'warning', text: 'Beteiligte (Regie o. Ae.) empfohlen' })
  if (record.manifestations.length === 0) out.push({ level: 'warning', text: 'Keine Manifestation erfasst' })
  if (record.items.length === 0) out.push({ level: 'warning', text: 'Kein Exemplar erfasst' })

  if (out.length === 0) out.push({ level: 'ok', text: 'Grunddaten vollstaendig' })
  return out
}

/** Klasse fuer den Fortschrittsring: low (unter 50), mid (unter 80), sonst leer. */
export function ringClass(percent: number): string {
  if (percent < 50) return 'low'
  if (percent < 80) return 'mid'
  return ''
}

/* -------------------------------------------------------------- Kernfelder */

export const CORE_FIELDS = {
  titel: 'Haupttitel',
  regie: 'Regie',
  produktionsdatum: 'Produktionsdatum',
  produktionsland: 'Produktionsland'
} as const

export type CoreFieldKey = keyof typeof CORE_FIELDS

/** Welche Kernfelder sind in diesem Datensatz belegt? */
export function corePresence(record: AvefiRecord): Record<CoreFieldKey, boolean> {
  const w = record.work
  const titel = hasName(w['has_primary_title'])

  let regie = false
  let datum = false
  let land = false

  for (const ev of asList(w['has_event'])) {
    if (String(ev['has_date'] ?? '').trim() !== '') datum = true
    for (const g of asList(ev['located_in'])) {
      if (hasName(g)) land = true
    }
    for (const act of asList(ev['has_activity'])) {
      if (act['category'] !== 'avefi:DirectingActivity') continue
      for (const a of asList(act['has_agent'])) {
        if (hasName(a)) regie = true
      }
    }
  }

  return { titel, regie, produktionsdatum: datum, produktionsland: land }
}

export interface CoreTally {
  records: number
  fields: Record<CoreFieldKey, number>
  /** Wie viele Datensaetze haben 0, 1, 2, 3 bzw. 4 Kernfelder? */
  complete: Record<'0' | '1' | '2' | '3' | '4', number>
}

export function newCoreTally(): CoreTally {
  return {
    records: 0,
    fields: { titel: 0, regie: 0, produktionsdatum: 0, produktionsland: 0 },
    complete: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
  }
}

/** Nimmt einen Datensatz in die Belegungsstatistik auf. Aendert die Statistik. */
export function addToCoreTally(tally: CoreTally, record: AvefiRecord): CoreTally {
  const presence = corePresence(record)
  tally.records++
  let n = 0
  for (const key of Object.keys(CORE_FIELDS) as CoreFieldKey[]) {
    if (presence[key]) {
      tally.fields[key]++
      n++
    }
  }
  const bucket = String(n) as '0' | '1' | '2' | '3' | '4'
  tally.complete[bucket]++
  return tally
}

export interface CoreSummary extends CoreTally {
  percent: Record<CoreFieldKey, number>
  allFour: number
  allFourPercent: number
  labels: typeof CORE_FIELDS
}

/** Ergaenzt Prozentwerte fuer die Anzeige. */
export function finishCoreTally(tally: CoreTally): CoreSummary {
  const n = Math.max(1, tally.records)
  const percent = { titel: 0, regie: 0, produktionsdatum: 0, produktionsland: 0 }
  for (const key of Object.keys(CORE_FIELDS) as CoreFieldKey[]) {
    percent[key] = Math.round((tally.fields[key] * 100) / n)
  }
  const allFour = tally.complete['4']
  return {
    ...tally,
    percent,
    allFour,
    allFourPercent: Math.round((allFour * 100) / n),
    labels: CORE_FIELDS
  }
}

/** Belegung je Kernfeld im Format von ImportReport.coverage. */
export function coreCoverage(tally: CoreTally): Record<string, { filled: number; total: number }> {
  const out: Record<string, { filled: number; total: number }> = {}
  for (const key of Object.keys(CORE_FIELDS) as CoreFieldKey[]) {
    out[key] = { filled: tally.fields[key], total: tally.records }
  }
  return out
}
