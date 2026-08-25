/*
 * Rechnen fuer den Editor: Vorschau, Pruefung, Speichern, Normdaten-Kandidaten.
 *
 * Gerechnet wird HIER, auf dem Server, mit demselben Code, der spaeter
 * konvertiert. Eine zweite Umsetzung im Browser waere schneller und wuerde
 * bedeuten, dass Vorschau und Ergebnis verschiedenen Code ausfuehren — dort
 * entstehen Fehler, die niemand findet, weil die Vorschau gruen war.
 *
 * Auch diese Datei traegt einen Vorgabe-Handler, weil Nitro aus jeder Datei in
 * server/api/ eine Route macht.
 */
import type { AvefiRecord, MappingJson, ProfileSample } from '#shared/types/domain'
import {
  buildPreview, buildProfileSample, columnStates, computeComplete, getTarget, hasBlocker,
  normalizeMapping, openColumns, staticCheck,
  type MappingCheck, type PreviewResult
} from '../../lib/mapping/index'
import { authorityCandidates, authorityServices, sourcesForKind } from '../../lib/authority/index'
import { checkRecords } from '../../worker/validate'
import { avefiSchemaVersion, fail, schemaModel, type TableSource } from './_lib'

/* ------------------------------------------------------------- Vorschau */

/** Ziel -> woher der Wert kommt. Grundlage des Ergebnisbaums. */
export type TargetUse = Record<string, Array<{ column: string; source: 'column' | 'default' }>>

export function targetUse(mapping: MappingJson): TargetUse {
  const out: TargetUse = {}
  for (const [col, spec] of Object.entries(mapping.columns ?? {})) {
    if (typeof spec !== 'object' || spec === null || spec.ignore === true) continue
    for (const binding of spec.targets ?? []) {
      const key = String(binding.target ?? '')
      if (key === '') continue
      ;(out[key] ??= []).push({ column: col, source: 'column' })
    }
  }
  for (const d of mapping.defaults ?? []) {
    const key = String(d.target ?? '')
    if (key === '') continue
    ;(out[key] ??= []).push({ column: String(d.value ?? ''), source: 'default' })
  }
  return out
}

export interface PreviewPayload extends PreviewResult {
  targetUse: TargetUse
  /** Spalte -> gemappt / ignoriert / noch nicht angefasst. */
  states: Record<string, 'mapped' | 'ignored' | 'untouched'>
  complete: boolean
  open: string[]
  blocking: boolean
}

/**
 * Rechnet den Entwurf auf echten Zeilen. Welche Zeilen das sind, entscheidet
 * buildPreview: je Spalte werden die ersten drei VERSCHIEDENEN gefuellten
 * Werte gesucht, statt stur bei Zeile 1 zu bleiben. Beispielwerte und
 * Ergebnisse stammen damit aus derselben Rechnung und meinen dieselben Zeilen.
 */
export async function previewFor(source: TableSource, raw: unknown): Promise<PreviewPayload> {
  const schema = await schemaModel()
  const version = await avefiSchemaVersion()
  const { mapping } = normalizeMapping(raw, { columns: source.columns, avefiSchemaVersion: version })

  const result = buildPreview(
    { columns: source.columns, rows: source.rows, rowCount: source.rowCount },
    mapping,
    { schema, ...authorityServices() }
  )

  return {
    ...result,
    targetUse: targetUse(mapping),
    states: columnStates(mapping),
    complete: computeComplete(mapping),
    open: openColumns(mapping),
    blocking: hasBlocker(result.checks)
  }
}

/* ----------------------------------------------------------- Schemapruefung */

/**
 * Prueft einen aus dem Entwurf erzeugten Datensatz gegen das AVefi-Schema.
 *
 * Geprueft wird im Dienst efi-conv — derselbe Validator, der spaeter die
 * Lieferung prueft. Eine eigene Pruefung hier waere eine zweite Wahrheit.
 * Bewusst ein eigener Aufruf und nicht Teil der Vorschau: Der Dienst ist zu
 * langsam fuer jeden Tastendruck.
 */
export async function schemaCheck(source: TableSource, raw: unknown): Promise<{
  checked: number
  valid: number
  issues: Array<{ severity: string; message: string; code?: string; record?: number }>
  unavailable: string | null
}> {
  const schema = await schemaModel()
  const version = await avefiSchemaVersion()
  const { mapping } = normalizeMapping(raw, { columns: source.columns, avefiSchemaVersion: version })

  const preview = buildPreview(
    { columns: source.columns, rows: source.rows, rowCount: source.rowCount },
    mapping,
    { schema, ...authorityServices() }
  )
  const canonical: AvefiRecord | null = preview.canonical
  if (canonical === null) return { checked: 0, valid: 0, issues: [], unavailable: null }

  const nodes: Record<string, unknown>[] = [
    ...(Object.keys(canonical.work).length > 0 ? [canonical.work as Record<string, unknown>] : []),
    ...(canonical.manifestations as Record<string, unknown>[]),
    ...(canonical.items as Record<string, unknown>[])
  ]
  if (nodes.length === 0) return { checked: 0, valid: 0, issues: [], unavailable: null }

  const result = await checkRecords(nodes, {}, 20_000)
  return {
    checked: result.checked,
    valid: result.valid,
    issues: result.issues.slice(0, 40),
    unavailable: result.unavailable
  }
}

/* --------------------------------------------------------------- Speichern */

export interface SavePrepared {
  mapping: MappingJson
  checks: MappingCheck[]
  complete: boolean
  open: string[]
  sample: ProfileSample
}

/**
 * Bereitet das Speichern vor: einlesen, statisch pruefen, Stichprobe bilden.
 *
 * Blockiert wird nur strukturell Unmoegliches (eine Liste in einem einwertigen
 * Ziel ohne "Element auswaehlen" oder "Zusammenfuegen"). Alles andere wird
 * gemeldet und gespeichert — warnen statt blockieren.
 */
export async function prepareSave(source: TableSource, raw: unknown): Promise<SavePrepared> {
  const schema = await schemaModel()
  const version = await avefiSchemaVersion()
  const { mapping } = normalizeMapping(raw, { columns: source.columns, avefiSchemaVersion: version })
  const checks = staticCheck(mapping, schema)

  if (hasBlocker(checks)) {
    throw fail(422, 'mapping_blocked', { checks }, 'Das Profil enthaelt strukturelle Fehler.')
  }

  return {
    mapping,
    checks,
    complete: computeComplete(mapping),
    open: openColumns(mapping),
    sample: buildProfileSample(source.columns, source.rows, { totalRows: source.rowCount })
  }
}

/* ----------------------------------------------------- Normdaten-Kandidaten */

/**
 * Kandidaten zu einem Wert. Geliefert werden bewusst auch die nicht eindeutigen
 * Treffer: Der Mensch soll sehen, was die Automatik gefunden und aus Vorsicht
 * verworfen hat.
 */
export async function candidatesFor(body: unknown): Promise<{
  value: string
  kind: string
  candidates: Awaited<ReturnType<typeof authorityCandidates>>
  warnings: string[]
}> {
  const data = (body ?? {}) as Record<string, unknown>
  const value = String(data.value ?? '').trim()
  const kind = String(data.kind ?? 'person')
  if (value === '') throw fail(400, 'no_value', {}, 'Kein Wert angegeben.')

  const schema = await schemaModel()
  const wanted = Array.isArray(data.sources) ? data.sources.map((s) => String(s)) : []
  const allowed = sourcesForKind(kind, schema)
  const sources = wanted.length > 0 ? allowed.filter((s) => wanted.includes(s)) : allowed

  const warnings: string[] = []
  const candidates = await authorityCandidates(value, kind, {
    sources,
    schema,
    onWarn: (m) => warnings.push(m)
  })
  return { value, kind, candidates, warnings }
}

/** Anzeigename eines Ziels — fuer Meldungen, die nicht in der Oberflaeche entstehen. */
export function targetLabel(key: string): string {
  return getTarget(key)?.path ?? key
}

/** Vorgabe-Handler: Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
