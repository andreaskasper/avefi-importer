/*
 * MappingRunner — fuehrt ein Mappingprofil auf Quellzeilen aus.
 *
 * Je Zeile: Spalte -> Vorkette -> Ziel(e) mit Nachkette -> Builder -> kanonischer
 * AVefi-Datensatz. Dazu Festwerte und die Werkbildung ueber einen konfigurierten
 * Schluessel.
 *
 * Derselbe Code bedient die Vorschau im Editor und die Konvertierung. Eine zweite
 * Umsetzung im Browser waere schneller, wuerde aber bedeuten, dass Vorschau und
 * Ergebnis auseinanderlaufen koennen.
 *
 * Die Pruefung ist zweistufig:
 *   statisch  beim Bauen des Profils, ohne Daten — Ausgabetyp der Kette gegen die
 *             Erwartung des Ziels, mit Vorschlag zum Nachbessern.
 *   zur Laufzeit gegen Enum, Muster und Kardinalitaet.
 * Beanstandet wird warnend. Blockiert wird nur, was strukturell nicht geht: eine
 * Liste in einem einwertigen Ziel ohne "Element auswaehlen" oder "Zusammenfuegen".
 */

import { createHash } from 'node:crypto'
import type {
  ColumnMapping, MappingJson, TransformStep, ValidationIssue
} from '#shared/types/domain'
import type { SourceRow } from './header.js'
import type { SchemaModel } from './schema-model.js'
import type { AuthorityHit, CountryHit, EnrichHit, TransformContext, TransformValue } from './transform.js'
import type { AvefiNode, AvefiRecord } from './builder.js'
import type { TargetDefinition } from './targets.js'
import { getSchemaModel } from './schema-model.js'
import { canonicalOp, chainType, compareForm, runChain } from './transform.js'
import { AvefiBuilder, acceptsAuthority } from './builder.js'
import { expectedChainType, getTarget, targetExists } from './targets.js'

/**
 * Beanstandung des Mappings. Erweitert ValidationIssue um den Vorschlag zum
 * Nachbessern; ein solches Feld gibt es in shared/types/domain.ts bisher nicht
 * (siehe Bericht).
 */
export interface MappingCheck extends ValidationIssue {
  /** Konverterschritt, der die Beanstandung ausraeumen wuerde. */
  fix?: TransformStep
}

/** Nachschlagedienste, die von aussen hereingereicht werden. */
export interface MappingServices {
  schema?: SchemaModel
  /**
   * Synchroner Griff in einen bereits gefuellten Zwischenspeicher. Echte
   * Abfragen laufen ausserhalb; welche Werte dafuer gebraucht werden, sagt
   * collectAuthorityLookups().
   */
  resolveAuthority?: (value: string, source: string, kind: string) => AuthorityHit | null
  lookupCountry?: (value: string) => CountryHit | null
  lookupLanguage?: (value: string) => string | null
}

/* -------------------------------------------------------- Zugriff aufs Profil */

function columnsOf(mapping: MappingJson): Array<[string, ColumnMapping]> {
  const cols = mapping.columns
  if (typeof cols !== 'object' || cols === null) return []
  return Object.entries(cols).filter((e): e is [string, ColumnMapping] => typeof e[1] === 'object' && e[1] !== null)
}

function chainOf(spec: ColumnMapping): TransformStep[] {
  return Array.isArray(spec.pre) ? spec.pre : []
}

function firstStep(chain: readonly TransformStep[], op: string): TransformStep | undefined {
  return chain.find((s) => typeof s === 'object' && s !== null && canonicalOp(String(s.op)) === op)
}

function chainHas(chain: readonly TransformStep[], op: string): boolean {
  return firstStep(chain, op) !== undefined
}

/** Hat eine Werteliste mindestens einen ausgefuellten Zielwert? */
function valuemapFilled(step: TransformStep): boolean {
  const raw = (step as Record<string, unknown>)['map']
  if (typeof raw !== 'object' || raw === null) return false
  return Object.values(raw as Record<string, unknown>).some((v) => String(v ?? '').trim() !== '')
}

/* ------------------------------------------------------- Statische Pruefung */

/**
 * Prueft das Profil ohne Daten: unbekannte Ziele, Typkonflikte, Kardinalitaet,
 * fehlende Pflichtangaben. severity "error" blockiert das Speichern,
 * "warning" nicht.
 */
export function staticCheck(mapping: MappingJson, schema: SchemaModel = getSchemaModel()): MappingCheck[] {
  const out: MappingCheck[] = []
  let hasWorkTitle = false

  for (const [col, spec] of columnsOf(mapping)) {
    if (spec.ignore === true) continue
    const pre = chainOf(spec)

    for (const binding of spec.targets ?? []) {
      const key = String(binding.target ?? '')
      const target = getTarget(key)
      if (target === undefined) {
        out.push({
          severity: 'error', code: 'target.unknown', sourceField: col,
          message: `Unbekanntes Ziel "${key}"`
        })
        continue
      }
      if (key === 'work.title.primary') hasWorkTitle = true

      const post = Array.isArray(binding.post) ? binding.post : []
      const chain = [...pre, ...post]
      const result = chainType(chain, 'text')

      for (const e of result.errors) {
        out.push({ severity: 'warning', code: 'chain.type', sourceField: col, targetField: key, message: e })
      }

      const want = expectedChainType(target)

      // Das einzig strukturell Unmoegliche: eine Liste in einem einwertigen Ziel.
      if (result.type === 'list' && !target.multi) {
        out.push({
          severity: 'error', code: 'chain.list-in-single', sourceField: col, targetField: key,
          message: `"${target.label}" nimmt nur einen Wert auf, die Kette liefert aber eine Liste. `
            + 'Ergaenze "Element auswaehlen" oder "Zusammenfuegen".',
          fix: { op: 'take', index: 1 }
        })
        continue
      }
      if (want === 'number' && result.type !== 'number') {
        out.push({
          severity: 'warning', code: 'chain.number', sourceField: col, targetField: key,
          message: `"${target.label}" erwartet eine Zahl.`,
          fix: { op: 'number' }
        })
      }
      if (target.type === 'duration' && !chainHas(chain, 'duration')) {
        out.push({
          severity: 'warning', code: 'chain.duration', sourceField: col, targetField: key,
          message: `"${target.label}" erwartet das ISO-Format PT01H30M00S. Konverter "duration" einfuegen?`,
          fix: { op: 'duration', unit: 'minutes' }
        })
      }
      if (target.type === 'date' && !chainHas(chain, 'date') && !chainHas(chain, 'year')) {
        out.push({
          severity: 'warning', code: 'chain.date', sourceField: col, targetField: key,
          message: `"${target.label}" erwartet ein Datum im ISO-Format. Konverter "date" einfuegen?`,
          fix: { op: 'date' }
        })
      }
      if (target.type === 'lang' && !chainHas(chain, 'language')) {
        out.push({
          severity: 'warning', code: 'chain.language', sourceField: col, targetField: key,
          message: `"${target.label}" erwartet einen ISO-639-2-Code. Konverter "language" einfuegen?`,
          fix: { op: 'language', unknown: 'keep' }
        })
      }
      if (chainHas(chain, 'authority') && !acceptsAuthority(target)) {
        out.push({
          severity: 'warning', code: 'authority.unsupported', sourceField: col, targetField: key,
          message: `"Normdaten nachschlagen" wirkt bei "${target.label}" nicht — gefundene IDs lassen sich `
            + 'nur an Personen, Schlagwoertern, Orten, Genres und Kennungs-Zielen hinterlegen.'
        })
      }
      if (target.type.startsWith('enum:')) {
        const vm = firstStep(chain, 'map')
        if (vm === undefined) {
          const values = schema.enum(target.type.slice(5))
          out.push({
            severity: 'warning', code: 'enum.no-valuemap', sourceField: col, targetField: key,
            message: `"${target.label}" hat eine feste Werteliste — ohne Zuordnung werden abweichende `
              + 'Schreibweisen beanstandet.',
            fix: values.length > 0 ? { op: 'map', map: {}, fallback: 'keep_note' } : { op: 'map', map: {} }
          })
        } else if (!valuemapFilled(vm)) {
          // Die Warnung verschwand im PHP-Stand, sobald die Zuordnung EXISTIERTE.
          // Eine leere Zuordnung liefert aber "kein Wert" — Datenverlust hinter
          // einer gruenen Anzeige.
          out.push({
            severity: 'warning', code: 'enum.empty-valuemap', sourceField: col, targetField: key,
            message: `Die Werteliste fuer "${target.label}" ist noch leer. Solange kein Zielwert eingetragen `
              + 'ist, kommt fuer diese Spalte nichts an.'
          })
        }
      }
    }
  }

  for (const d of mapping.defaults ?? []) {
    const key = String(d.target ?? '')
    if (key === 'work.title.primary') hasWorkTitle = true
    if (!targetExists(key)) {
      out.push({
        severity: 'error', code: 'default.unknown-target',
        message: `Festwert zeigt auf ein unbekanntes Ziel "${key}"`
      })
    }
  }

  if (!hasWorkTitle) {
    out.push({
      severity: 'warning', code: 'work.no-title',
      message: 'Keine Spalte auf "Werk > Haupttitel" gemappt. Ersatzweise wird der Titel der Fassung '
        + 'oder des Exemplars uebernommen.'
    })
  }

  return out
}

/** Blockiert eine der Beanstandungen das Speichern? */
export function hasBlocker(checks: readonly MappingCheck[]): boolean {
  return checks.some((c) => c.severity === 'error')
}

/* ---------------------------------------------------------- Normdatenbedarf */

export interface AuthorityRequest {
  column: string
  source: string
  kind: string
  values: string[]
}

/**
 * Sammelt ein, welche Werte fuer den authority-Konverter nachgeschlagen werden
 * muessen. Der Aufrufer loest das ausserhalb auf — hier laeuft nichts uebers Netz.
 * Bereits bestaetigte Zuordnungen fallen heraus.
 */
export function collectAuthorityLookups(
  mapping: MappingJson,
  rows: readonly SourceRow[]
): AuthorityRequest[] {
  const out: AuthorityRequest[] = []

  for (const [col, spec] of columnsOf(mapping)) {
    if (spec.ignore === true) continue
    const confirmed = normalizeConfirmed(spec)

    const chains: TransformStep[][] = []
    for (const binding of spec.targets ?? []) {
      chains.push([...chainOf(spec), ...(Array.isArray(binding.post) ? binding.post : [])])
    }

    for (const chain of chains) {
      const step = firstStep(chain, 'authority')
      if (step === undefined) continue
      const p = step as Record<string, unknown>
      const source = String(p['source'] ?? 'gnd')
      const kind = String(p['kind'] ?? 'person')

      // Die Kette bis zum authority-Schritt rechnen, damit auch getrimmte und
      // aufgeteilte Werte im Bedarf stehen, nicht nur die Rohzelle.
      const upto = chain.slice(0, chain.indexOf(step))
      const seen = new Set<string>()
      for (const row of rows) {
        const res = runChain(upto, String(row[col] ?? ''), { row })
        const values = Array.isArray(res.value) ? res.value : [res.value]
        for (const v of values) {
          const s = String(v).trim()
          if (s === '') continue
          const key = compareForm(s)
          if (seen.has(key) || confirmed[key] !== undefined) continue
          seen.add(key)
        }
      }
      if (seen.size > 0) out.push({ column: col, source, kind, values: [...seen] })
    }
  }

  return out
}

function normalizeConfirmed(spec: ColumnMapping): Record<string, { id: string; type: string; label?: string }> {
  const out: Record<string, { id: string; type: string; label?: string }> = {}
  const raw = spec.authorities
  if (typeof raw !== 'object' || raw === null) return out
  for (const [value, entry] of Object.entries(raw)) {
    if (typeof entry !== 'object' || entry === null) continue
    out[compareForm(value)] = { id: String(entry.id ?? ''), type: String(entry.type ?? ''), ...(entry.label !== undefined ? { label: entry.label } : {}) }
  }
  return out
}

/* ---------------------------------------------------------------- Ausfuehren */

export interface CellOutput {
  target: string
  label: string
  value: string
  ids?: Array<{ id: string; note: string; origin: string }>
}

export interface CellResult {
  raw: string
  outputs: CellOutput[]
  errors: string[]
}

export interface RunRowResult {
  canonical: AvefiRecord
  cells: Record<string, CellResult>
  /** Alle Beanstandungen der Zeile, jeweils mit Spaltenbezug. */
  errors: string[]
  issues: MappingCheck[]
  idOrigins: { bestaetigt: number; automatisch: number }
}

/** Wendet das Profil auf eine Zeile an. */
export function runRow(
  mapping: MappingJson,
  row: SourceRow,
  baseId: string,
  services: MappingServices = {},
  rowNumber?: number
): RunRowResult {
  const schema = services.schema ?? getSchemaModel()
  const builder = new AvefiBuilder(schema)
  const cells: Record<string, CellResult> = {}
  const errors: string[] = []
  const issues: MappingCheck[] = []
  const idOrigins = { bestaetigt: 0, automatisch: 0 }

  for (const [col, spec] of columnsOf(mapping)) {
    if (spec.ignore === true) continue
    const targets = spec.targets ?? []
    if (targets.length === 0) continue

    const ctx: TransformContext = {
      row,
      confirmed: normalizeConfirmed(spec),
      schema,
      ...(services.resolveAuthority !== undefined ? { resolveAuthority: services.resolveAuthority } : {}),
      ...(services.lookupCountry !== undefined ? { lookupCountry: services.lookupCountry } : {}),
      ...(services.lookupLanguage !== undefined ? { lookupLanguage: services.lookupLanguage } : {})
    }

    const raw = String(row[col] ?? '')
    const pre = runChain(chainOf(spec), raw, ctx)
    const cellErrors: string[] = [...pre.errors]
    const outputs: CellOutput[] = []

    for (const binding of targets) {
      const key = String(binding.target ?? '')
      const target = getTarget(key)
      if (target === undefined) {
        cellErrors.push(`Unbekanntes Ziel "${key}"`)
        continue
      }

      const post = runChain(Array.isArray(binding.post) ? binding.post : [], pre.value, ctx)
      cellErrors.push(...post.errors)
      for (const n of post.notes) builder.addNote(col, n)

      // Normdaten-Treffer nach Quellwert buendeln: Der Wert bleibt der Name,
      // die ID haengt der Builder als same_as an die erzeugte Entitaet.
      const found = new Map<string, EnrichHit[]>()
      for (const e of [...pre.enrich, ...post.enrich]) {
        const list = found.get(e.value) ?? []
        list.push(e)
        found.set(e.value, list)
        if (e.origin === 'bestaetigt' || e.origin === 'automatisch') idOrigins[e.origin]++
      }

      let values = toValueList(post.value)
      if (!target.multi && values.length > 1) {
        // Kardinalitaet zur Laufzeit: warnen, nicht wegwerfen ohne Hinweis.
        issues.push({
          severity: 'warning', code: 'value.truncated', sourceField: col, targetField: key,
          message: `"${target.label}" nimmt nur einen Wert auf; ${values.length - 1} weitere Werte dieser `
            + 'Zelle bleiben unberuecksichtigt.',
          ...(rowNumber !== undefined ? { row: rowNumber } : {}),
          fix: { op: 'join', sep: '; ' }
        })
        values = values.slice(0, 1)
      }

      for (const v of values) {
        const hits = found.get(String(v)) ?? []
        const errs = builder.write(target, v, hits)
        cellErrors.push(...errs)
        for (const e of errs) {
          issues.push({
            severity: 'warning', code: 'value.invalid', sourceField: col, targetField: key,
            message: e, value: String(v).slice(0, 120),
            ...(rowNumber !== undefined ? { row: rowNumber } : {})
          })
        }
        if (errs.length === 0 && String(v).trim() !== '') {
          const out: CellOutput = { target: key, label: target.path, value: String(v) }
          if (hits.length > 0) {
            out.ids = hits.map((e) => ({ id: e.id, note: e.note ?? '', origin: e.origin ?? '' }))
          }
          outputs.push(out)
        }
      }
    }

    cells[col] = { raw, outputs, errors: cellErrors }
    for (const e of cellErrors) errors.push(`${col}: ${e}`)
  }

  // Festwerte zuletzt, damit sie nur fuellen, was die Quelle nicht liefert.
  for (const d of mapping.defaults ?? []) {
    const target = getTarget(String(d.target ?? ''))
    if (target === undefined) continue
    builder.write(target, String(d.value ?? ''))
  }

  return { canonical: builder.build(baseId), cells, errors, issues, idOrigins }
}

function toValueList(value: TransformValue): Array<string | number> {
  return Array.isArray(value) ? value : [value]
}

/* ------------------------------------------------------------ Sammelbericht */

export interface RunTally {
  rows: number
  valueErrors: number
  /** Spalte -> Anzahl Beanstandungen samt bis zu fuenf verschiedenen Beispielen. */
  columnIssues: Record<string, { errors: number; samples: string[] }>
  idOrigins: { bestaetigt: number; automatisch: number }
}

export function newRunTally(): RunTally {
  return { rows: 0, valueErrors: 0, columnIssues: {}, idOrigins: { bestaetigt: 0, automatisch: 0 } }
}

/** Nimmt ein Zeilenergebnis in den Sammelbericht auf. Aendert den Bericht. */
export function addToTally(tally: RunTally, result: RunRowResult): RunTally {
  tally.rows++
  tally.idOrigins.bestaetigt += result.idOrigins.bestaetigt
  tally.idOrigins.automatisch += result.idOrigins.automatisch

  for (const [col, cell] of Object.entries(result.cells)) {
    if (cell.errors.length === 0) continue
    tally.valueErrors += cell.errors.length
    const bucket = tally.columnIssues[col] ?? { errors: 0, samples: [] }
    bucket.errors += cell.errors.length
    for (const e of cell.errors) {
      if (bucket.samples.length < 5 && !bucket.samples.includes(e)) bucket.samples.push(e)
    }
    tally.columnIssues[col] = bucket
  }
  return tally
}

/* --------------------------------------------------------------- Werkbildung */

/** Ist eine Zusammenfassung von Zeilen zu Werken eingeschaltet? Standard: aus. */
export function groupsWorks(mapping: MappingJson): boolean {
  return (mapping.grouping?.work?.by ?? []).length > 0
}

/** Klartext der verwendeten Regel fuer den Pruefbericht. */
export function groupingLabel(mapping: MappingJson): string {
  const by = mapping.grouping?.work?.by ?? []
  if (by.length === 0) return 'keine Zusammenfassung — jede Zeile ein eigenes Werk'
  return by.map((raw) => {
    const k = String(raw)
    if (k.startsWith('column:')) return `Spalte "${k.slice(7)}"`
    if (k.startsWith('target:')) {
      const t = getTarget(k.slice(7))
      return t !== undefined ? t.label : k.slice(7)
    }
    return k
  }).join(' + ')
}

/**
 * Schluessel, unter dem eine Zeile zu einem Werk gehoert (null = kein Merge).
 * Bevorzugt auf gemappte Zielwerte statt Rohspalten: nach trim und lowercase
 * fallen "Die Wilden Kerle " und "die wilden kerle" zusammen, vorher nicht.
 * Gilt nur innerhalb eines Imports.
 */
export function workKey(mapping: MappingJson, row: SourceRow, canonical: AvefiRecord): string | null {
  const by = mapping.grouping?.work?.by ?? []
  if (by.length === 0) return null

  const parts: string[] = []
  for (const raw of by) {
    const k = String(raw)
    if (k.startsWith('column:')) {
      parts.push(String(row[k.slice(7)] ?? '').trim().toLowerCase())
    } else if (k.startsWith('target:')) {
      parts.push(readTarget(canonical, k.slice(7)).trim().toLowerCase())
    }
  }
  const joined = parts.join('')
  if (joined.replace(/[ ]/g, '') === '') return null
  return createHash('md5').update(joined).digest('hex')
}

function asNode(v: unknown): AvefiNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as AvefiNode) : {}
}

function asList(v: unknown): AvefiNode[] {
  return Array.isArray(v) ? (v as AvefiNode[]) : []
}

function text(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
}

/** Liest den ersten Wert eines Ziels aus einem kanonischen Datensatz. */
export function readTarget(canonical: AvefiRecord, key: string): string {
  const target: TargetDefinition | undefined = getTarget(key)
  if (target === undefined) return ''

  const node: AvefiNode = target.level === 'work'
    ? canonical.work
    : target.level === 'manifestation'
      ? asNode(canonical.manifestations[0])
      : asNode(canonical.items[0])

  const w = target.writer
  switch (w.kind) {
    case 'title':
      return text(asNode(node['has_primary_title'])['has_name'])
    case 'prop':
      return text(node[w.prop])
    case 'strlist': {
      const list = node[w.prop]
      return Array.isArray(list) ? text(list[0]) : ''
    }
    case 'named':
      return text(asNode(asList(node[w.prop])[0])['has_name'])
    case 'subject':
      return text(asNode(asList(node['has_subject'])[0])['has_name'])
    case 'duration':
      return text(asNode(node['has_duration'])['has_value'])
    case 'extent':
      return text(asNode(node['has_extent'])['has_value'])
    case 'identifier':
      return text(asNode(asList(node['has_identifier'])[0])['id'])
    case 'sameas':
      return text(asNode(asList(node['same_as'])[0])['id'])
    case 'eventdate': {
      for (const e of asList(node['has_event'])) {
        if (e['category'] === w.category) return text(e['has_date'])
      }
      return ''
    }
    case 'eventplace': {
      for (const e of asList(node['has_event'])) {
        if (e['category'] === w.category) return text(asNode(asList(e['located_in'])[0])['has_name'])
      }
      return ''
    }
    case 'activity': {
      for (const e of asList(node['has_event'])) {
        for (const a of asList(e['has_activity'])) {
          if (a['category'] === w.category) return text(asNode(asList(a['has_agent'])[0])['has_name'])
        }
      }
      return ''
    }
    case 'language':
      return text(asNode(asList(node['in_language'])[0])['code'])
  }
  return ''
}

/**
 * Fuehrt zwei kanonische Datensaetze desselben Werks zusammen: Werkangaben werden
 * ergaenzt (nicht ueberschrieben), Fassungen und Exemplare angehaengt.
 */
export function mergeRecords(base: AvefiRecord, add: AvefiRecord): AvefiRecord {
  const work = mergeNode(base.work, add.work)

  let workId: string | null = null
  for (const i of asList(work['has_identifier'])) {
    if (i['category'] === 'avefi:LocalResource') {
      workId = text(i['id'])
      break
    }
  }

  const manifestations = [...base.manifestations]
  for (const m of add.manifestations) {
    const copy: AvefiNode = { ...m }
    if (workId !== null) copy['is_manifestation_of'] = [{ category: 'avefi:LocalResource', id: workId }]
    manifestations.push(copy)
  }

  return { work, manifestations, items: [...base.items, ...add.items] }
}

/** Ergaenzt fehlende Felder; Listen werden vereinigt, Skalare nicht ueberschrieben. */
function mergeNode(a: AvefiNode, b: AvefiNode): AvefiNode {
  const out: AvefiNode = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (!(k in out)) {
      out[k] = v
      continue
    }
    const mine = out[k]
    if (Array.isArray(mine) && Array.isArray(v)) {
      const merged = [...mine]
      for (const e of v) {
        if (!merged.some((x) => sameValue(x, e))) merged.push(e)
      }
      out[k] = merged
    }
  }
  return out
}

/** Vergleicht zwei Listeneintraege dem Inhalt nach; PHPs in_array arbeitet ebenso. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
