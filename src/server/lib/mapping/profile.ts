/*
 * MappingProfile — Arbeit am Profil selbst: anlegen, einlesen, pruefen,
 * uebernehmen, aus- und wieder einlesen.
 *
 * Hier steht ausschliesslich Logik auf dem Profilobjekt. Wo ein Profil
 * herkommt und wohin es gespeichert wird, entscheidet der Aufrufer; diese Datei
 * kennt weder Datenbank noch HTTP.
 *
 * Der dritte Spaltenzustand ist der Grund fuer das Vollstaendigkeitskennzeichen:
 * Eine Spalte ist gemappt, ausdruecklich ignoriert ODER noch nicht angefasst.
 * Erst wenn keine Spalte mehr im dritten Zustand ist, gilt ein Profil als
 * vollstaendig. Ohne diese Unterscheidung speichert jemand ein halbes Profil und
 * wundert sich ueber leere Datensaetze.
 */

import type {
  BaseFormat, ColumnMapping, MappingJson, MappingProfileExport,
  ProfileSample, TransformStep, ValidationIssue
} from '#shared/types/domain'
import type { ColumnDiff } from './header.js'
import { diffColumns, normalizeHeader } from './header.js'
import { canonicalOp, transformExists } from './transform.js'

/** Format des Profils selbst. Aendert sich nur, wenn sich der Aufbau aendert. */
export const PROFILE_FORMAT_VERSION = 1 as const

/* --------------------------------------------------- Dritter Spaltenzustand */

export type ColumnState = 'mapped' | 'ignored' | 'untouched'

export function columnState(spec: ColumnMapping | undefined): ColumnState {
  if (spec === undefined || typeof spec !== 'object' || spec === null) return 'untouched'
  if (spec.ignore === true) return 'ignored'
  if (Array.isArray(spec.targets) && spec.targets.length > 0) return 'mapped'
  return 'untouched'
}

export function columnStates(mapping: MappingJson): Record<string, ColumnState> {
  const out: Record<string, ColumnState> = {}
  for (const [name, spec] of Object.entries(mapping.columns ?? {})) out[name] = columnState(spec)
  return out
}

/** Spalten ohne Entscheidung — die Anzeige "noch offen". */
export function openColumns(mapping: MappingJson): string[] {
  return Object.entries(mapping.columns ?? {})
    .filter(([, spec]) => columnState(spec) === 'untouched')
    .map(([name]) => name)
}

/**
 * Vollstaendig ist ein Profil, wenn keine Spalte mehr unbeantwortet ist und
 * mindestens eine Spalte tatsaechlich irgendwo hinfuehrt. Ein Profil, in dem
 * alles ignoriert ist, erzeugt keine Datensaetze und ist deshalb nicht fertig.
 */
export function computeComplete(mapping: MappingJson): boolean {
  const cols = Object.values(mapping.columns ?? {})
  if (cols.length === 0) return false
  let anyTarget = false
  for (const spec of cols) {
    const state = columnState(spec)
    if (state === 'untouched') return false
    if (state === 'mapped') anyTarget = true
  }
  return anyTarget
}

/* --------------------------------------------------------- Profil erzeugen */

/** Leeres Geruest fuer eine frisch erkannte Kopfzeile. */
export function emptyMapping(columns: readonly string[], avefiSchemaVersion: string | null = null): MappingJson {
  const cols: Record<string, ColumnMapping> = {}
  for (const c of columns) cols[String(c)] = { pre: [], targets: [] }
  return {
    profileFormatVersion: PROFILE_FORMAT_VERSION,
    avefiSchemaVersion,
    columns: cols,
    defaults: [],
    row: { represents: 'item' },
    grouping: { work: { by: [] }, manifestation: { by: [] } }
  }
}

/** Vorschlag fuer den Profilnamen beim ersten Speichern. */
export function suggestProfileName(institutionName: string | null, filename: string): string {
  let base = filename.replace(/\.[A-Za-z0-9]{1,6}$/, '').trim()
  if (base === '') base = 'Tabelle'
  const prefix = institutionName !== null && institutionName.trim() !== '' ? `${institutionName.trim()} · ` : ''
  return (prefix + base).trim()
}

/* ------------------------------------------------------- Einlesen und Migration */

export interface NormalizeResult {
  mapping: MappingJson
  /** Was beim Einlesen angepasst oder beanstandet wurde. */
  issues: ValidationIssue[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizeChain(raw: unknown, issues: ValidationIssue[], where: string): TransformStep[] {
  if (!Array.isArray(raw)) return []
  const out: TransformStep[] = []
  for (const step of raw) {
    if (typeof step === 'string') {
      // Alte Kurzform ohne Parameter. Sie wird uebernommen, aber nicht mehr erzeugt.
      const op = canonicalOp(step)
      if (transformExists(op)) {
        out.push({ op } as TransformStep)
        issues.push({
          severity: 'info', code: 'chain.shorthand', sourceField: where,
          message: `Konverter "${step}" lag als reine Zeichenkette vor und wurde in ein Objekt umgewandelt.`
        })
      } else {
        issues.push({
          severity: 'warning', code: 'chain.unknown-op', sourceField: where,
          message: `Unbekannter Konverter "${step}" wurde entfernt.`
        })
      }
      continue
    }
    if (!isRecord(step)) continue
    const rawOp = String(step['op'] ?? '')
    const op = canonicalOp(rawOp)
    if (!transformExists(op)) {
      issues.push({
        severity: 'warning', code: 'chain.unknown-op', sourceField: where,
        message: `Unbekannter Konverter "${rawOp}" wurde entfernt.`
      })
      continue
    }
    if (op !== rawOp) {
      issues.push({
        severity: 'info', code: 'chain.renamed-op', sourceField: where,
        message: `Konverter "${rawOp}" heisst jetzt "${op}".`
      })
    }
    out.push({ ...step, op } as TransformStep)
  }
  return out
}

/**
 * Liest ein Mapping beliebiger Herkunft ein und bringt es auf den heutigen Stand.
 *
 * Vertraeglich zu aelteren Profilen: fehlt die Profilformat-Version, wird sie
 * ergaenzt; fehlt die AVefi-Schemaversion, wird die uebergebene eingetragen;
 * umbenannte Konverter werden mitgezogen; global gefuehrte Normdaten-Bestaetigungen
 * wandern an die Spalten, die tatsaechlich nachschlagen.
 */
export function normalizeMapping(
  raw: unknown,
  options: { columns?: readonly string[]; avefiSchemaVersion?: string | null } = {}
): NormalizeResult {
  const issues: ValidationIssue[] = []
  const src = isRecord(raw) ? raw : {}
  const fallbackVersion = options.avefiSchemaVersion ?? null

  if (src['profileFormatVersion'] === undefined) {
    issues.push({
      severity: 'info', code: 'profile.version-added',
      message: `Das Profil trug keine Profilformat-Version; ergaenzt als ${PROFILE_FORMAT_VERSION}.`
    })
  } else if (src['profileFormatVersion'] !== PROFILE_FORMAT_VERSION) {
    issues.push({
      severity: 'warning', code: 'profile.version-mismatch',
      message: `Das Profil hat die Profilformat-Version ${String(src['profileFormatVersion'])}, `
        + `gelesen wird es als Version ${PROFILE_FORMAT_VERSION}.`
    })
  }

  const schemaVersion = typeof src['avefiSchemaVersion'] === 'string' ? src['avefiSchemaVersion'] : null
  if (schemaVersion === null && fallbackVersion !== null) {
    issues.push({
      severity: 'info', code: 'profile.schema-version-added',
      message: `Das Profil nannte keine AVefi-Schemaversion; eingetragen wurde ${fallbackVersion}.`
    })
  } else if (schemaVersion !== null && fallbackVersion !== null && schemaVersion !== fallbackVersion) {
    issues.push({
      severity: 'warning', code: 'profile.schema-version-mismatch',
      message: `Das Profil wurde gegen AVefi-Schema ${schemaVersion} gebaut, hier liegt ${fallbackVersion}. `
        + 'Wertelisten koennen sich geaendert haben.'
    })
  }

  // Frueher standen bestaetigte Normdaten global unter mapping.authorities,
  // getrennt nach Quelle. Heute gehoeren sie an die Spalte, die nachschlaegt.
  const legacyAuthorities: Record<string, Record<string, { id: string; type: string; label?: string }>> = {}
  if (isRecord(src['authorities'])) {
    for (const [source, entries] of Object.entries(src['authorities'])) {
      if (!isRecord(entries)) continue
      const bucket: Record<string, { id: string; type: string; label?: string }> = {}
      for (const [value, entry] of Object.entries(entries)) {
        if (!isRecord(entry)) continue
        const label = entry['label']
        bucket[value] = {
          id: String(entry['id'] ?? ''),
          type: String(entry['type'] ?? source),
          ...(typeof label === 'string' ? { label } : {})
        }
      }
      if (Object.keys(bucket).length > 0) legacyAuthorities[source] = bucket
    }
  }

  const columns: Record<string, ColumnMapping> = {}
  const rawColumns = isRecord(src['columns']) ? src['columns'] : {}
  for (const [name, spec] of Object.entries(rawColumns)) {
    if (!isRecord(spec)) {
      columns[name] = { pre: [], targets: [] }
      continue
    }
    const pre = normalizeChain(spec['pre'], issues, name)
    const targets = Array.isArray(spec['targets'])
      ? spec['targets'].filter(isRecord).map((t) => ({
          target: String(t['target'] ?? ''),
          post: normalizeChain(t['post'], issues, name)
        }))
      : []

    const out: ColumnMapping = { pre, targets }
    if (spec['ignore'] === true) out.ignore = true
    if (isRecord(spec['valuemap'])) {
      const vm: Record<string, string> = {}
      for (const [k, v] of Object.entries(spec['valuemap'])) vm[k] = String(v ?? '')
      out.valuemap = vm
    }

    const authorities: Record<string, { id: string; type: string; label?: string }> = {}
    if (isRecord(spec['authorities'])) {
      for (const [value, entry] of Object.entries(spec['authorities'])) {
        if (!isRecord(entry)) continue
        const label = entry['label']
        authorities[value] = {
          id: String(entry['id'] ?? ''),
          type: String(entry['type'] ?? ''),
          ...(typeof label === 'string' ? { label } : {})
        }
      }
    }
    // Altbestand: nur an die Spalten haengen, die diese Quelle auch abfragen.
    for (const chain of [pre, ...targets.map((t) => t.post)]) {
      for (const step of chain) {
        if (step.op !== 'authority') continue
        const source = String((step as Record<string, unknown>)['source'] ?? 'gnd')
        for (const [value, entry] of Object.entries(legacyAuthorities[source] ?? {})) {
          if (authorities[value] === undefined) authorities[value] = entry
        }
      }
    }
    if (Object.keys(authorities).length > 0) out.authorities = authorities

    columns[name] = out
  }

  // Spalten der aktuellen Kopfzeile, die im Profil fehlen, kommen als
  // "noch nicht angefasst" dazu — nicht als leeres Mapping getarnt.
  for (const c of options.columns ?? []) {
    if (columns[c] === undefined) columns[c] = { pre: [], targets: [] }
  }

  const defaults = Array.isArray(src['defaults'])
    ? src['defaults'].filter(isRecord).map((d) => ({ target: String(d['target'] ?? ''), value: String(d['value'] ?? '') }))
    : []

  const represents = isRecord(src['row']) ? src['row']['represents'] : undefined
  const row: MappingJson['row'] = {
    represents: represents === 'work' || represents === 'manifestation' ? represents : 'item'
  }

  const groupingSrc = isRecord(src['grouping']) ? src['grouping'] : {}
  const by = (v: unknown): string[] => {
    const g = isRecord(v) ? v['by'] : undefined
    return Array.isArray(g) ? g.map((x) => String(x)) : []
  }

  const mapping: MappingJson = {
    profileFormatVersion: PROFILE_FORMAT_VERSION,
    avefiSchemaVersion: schemaVersion ?? fallbackVersion,
    columns,
    defaults,
    row,
    grouping: {
      work: { by: by(groupingSrc['work']) },
      manifestation: { by: by(groupingSrc['manifestation']) }
    }
  }

  return { mapping, issues }
}

/* ---------------------------------------------- Abgleich mit der Kopfzeile */

export interface ProfileColumnReport extends ColumnDiff {
  /** Kann das Profil auf diese Kopfzeile angewandt werden? */
  usable: boolean
  /** Verstaendlicher Satz fuer die Oberflaeche. */
  summary: string
}

/**
 * Vergleicht die im Profil beschriebenen Spalten mit der tatsaechlichen
 * Kopfzeile und liefert das Ergebnis strukturiert: fehlend, zusaetzlich,
 * passend — dazu Umbenennungsverdacht.
 */
export function checkProfileColumns(mapping: MappingJson, columns: readonly string[]): ProfileColumnReport {
  const diff = diffColumns(Object.keys(mapping.columns ?? {}), columns)
  const usable = diff.matched.length > 0

  const parts: string[] = []
  parts.push(`${diff.matched.length} von ${columns.length} Spalten passen`)
  if (diff.missing.length > 0) parts.push(`${diff.missing.length} im Profil beschriebene Spalten fehlen in der Datei`)
  if (diff.extra.length > 0) parts.push(`${diff.extra.length} Spalten der Datei sind im Profil nicht beschrieben`)
  if (diff.renamed.length > 0) parts.push(`${diff.renamed.length} davon sehen nach einer Umbenennung aus`)

  return { ...diff, usable, summary: parts.join(', ') + '.' }
}

/* --------------------------------------------------------- Fremdes Profil */

export interface AdoptResult {
  mapping: MappingJson
  matched: string[]
  missing: string[]
  extra: string[]
}

/**
 * Uebernimmt ein fremdes Mapping auf die eigene Spaltenliste. Spalten, die es
 * hier nicht gibt, fallen weg; hiesige Spalten ohne Entsprechung bleiben im
 * dritten Zustand und muessen beantwortet werden.
 */
export function adoptMapping(
  foreign: MappingJson,
  columns: readonly string[],
  avefiSchemaVersion: string | null = null
): AdoptResult {
  const byNorm = new Map<string, ColumnMapping>()
  for (const [name, spec] of Object.entries(foreign.columns ?? {})) byNorm.set(normalizeHeader(name), spec)

  const out = emptyMapping(columns, foreign.avefiSchemaVersion ?? avefiSchemaVersion)
  const matched: string[] = []
  const missing: string[] = []

  for (const c of columns) {
    const key = normalizeHeader(c)
    const spec = byNorm.get(key)
    if (spec !== undefined) {
      out.columns[c] = spec
      matched.push(c)
      byNorm.delete(key)
    } else {
      missing.push(c)
    }
  }

  out.defaults = foreign.defaults ?? []
  out.row = foreign.row ?? { represents: 'item' }
  out.grouping = foreign.grouping ?? { work: { by: [] }, manifestation: { by: [] } }

  return { mapping: out, matched, missing, extra: [...byNorm.keys()] }
}

/**
 * Feldvorschlaege aus fremden Profilen: gleichnamige Spalten sind ein Indiz,
 * auch wenn die Kopfzeile insgesamt nicht passt. Die Profile werden hereingereicht;
 * woher sie kommen, entscheidet der Aufrufer.
 */
export function targetHintsFromMappings(
  columns: readonly string[],
  mappings: readonly MappingJson[],
  limit = 3
): Record<string, Array<{ target: string; count: number }>> {
  const want = new Map<string, string>()
  for (const c of columns) want.set(normalizeHeader(c), c)

  const tally = new Map<string, Map<string, number>>()
  for (const m of mappings) {
    for (const [name, spec] of Object.entries(m.columns ?? {})) {
      const col = want.get(normalizeHeader(name))
      if (col === undefined) continue
      for (const t of spec.targets ?? []) {
        const key = String(t.target ?? '')
        if (key === '') continue
        const bucket = tally.get(col) ?? new Map<string, number>()
        bucket.set(key, (bucket.get(key) ?? 0) + 1)
        tally.set(col, bucket)
      }
    }
  }

  const out: Record<string, Array<{ target: string; count: number }>> = {}
  for (const [col, bucket] of tally) {
    out[col] = [...bucket.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([target, count]) => ({ target, count }))
  }
  return out
}

/* ------------------------------------------------------- Aus- und Einlesen */

export interface ExportOptions {
  profileName: string
  profileVersion: number
  baseFormat: BaseFormat
  headerHash: string
  institution?: string
  exportedAt?: string
}

/**
 * Baut die Exportdatei. Die Stichprobe gehoert dazu — ohne sie laesst sich das
 * Profil beim Empfaenger nicht bearbeiten, weil der Editor keine Beispielwerte
 * anzeigen kann.
 */
export function buildProfileExport(
  mapping: MappingJson,
  sample: ProfileSample | null,
  options: ExportOptions
): MappingProfileExport {
  return {
    origin: {
      application: 'avefi-importer',
      exportedAt: options.exportedAt ?? new Date().toISOString(),
      profileName: options.profileName,
      profileVersion: options.profileVersion,
      ...(options.institution !== undefined ? { institution: options.institution } : {})
    },
    profileFormatVersion: PROFILE_FORMAT_VERSION,
    avefiSchemaVersion: mapping.avefiSchemaVersion,
    baseFormat: options.baseFormat,
    headerHash: options.headerHash,
    mapping,
    sample
  }
}

export interface ReadExportResult {
  export: MappingProfileExport | null
  issues: ValidationIssue[]
}

/** Liest eine Exportdatei ein und bringt das enthaltene Mapping auf den Stand. */
export function readProfileExport(
  raw: unknown,
  options: { avefiSchemaVersion?: string | null } = {}
): ReadExportResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', code: 'export.unreadable', message: 'Die Datei enthaelt kein Profil.' })
    return { export: null, issues }
  }

  const origin = isRecord(raw['origin']) ? raw['origin'] : {}
  if (origin['application'] !== 'avefi-importer') {
    issues.push({
      severity: 'warning', code: 'export.foreign',
      message: 'Die Datei stammt nicht aus diesem Importer. Sie wird versuchsweise gelesen.'
    })
  }

  const mappingSource = raw['mapping'] ?? raw
  const { mapping, issues: mappingIssues } = normalizeMapping(mappingSource, {
    ...(options.avefiSchemaVersion !== undefined ? { avefiSchemaVersion: options.avefiSchemaVersion } : {})
  })
  issues.push(...mappingIssues)

  const sample = normalizeSample(raw['sample'])
  if (sample === null) {
    issues.push({
      severity: 'warning', code: 'export.no-sample',
      message: 'Der Export enthaelt keine Stichprobe. Ohne Beispielwerte laesst sich das Profil nur '
        + 'eingeschraenkt bearbeiten.'
    })
  }

  const baseFormat = raw['baseFormat']
  const headerHash = raw['headerHash']

  return {
    export: {
      origin: {
        application: 'avefi-importer',
        exportedAt: typeof origin['exportedAt'] === 'string' ? origin['exportedAt'] : new Date().toISOString(),
        profileName: typeof origin['profileName'] === 'string' ? origin['profileName'] : 'Uebernommenes Profil',
        profileVersion: typeof origin['profileVersion'] === 'number' ? origin['profileVersion'] : 1,
        ...(typeof origin['institution'] === 'string' ? { institution: origin['institution'] } : {})
      },
      profileFormatVersion: PROFILE_FORMAT_VERSION,
      avefiSchemaVersion: mapping.avefiSchemaVersion,
      baseFormat: (typeof baseFormat === 'string' ? baseFormat : 'csv') as BaseFormat,
      headerHash: typeof headerHash === 'string' ? headerHash : '',
      mapping,
      sample
    },
    issues
  }
}

/** Deckel fuer die abgelegte Stichprobe: mehr als 25 Zeilen gehoeren nicht ins Profil. */
export const SAMPLE_ROW_LIMIT = 25

export function normalizeSample(raw: unknown): ProfileSample | null {
  if (!isRecord(raw)) return null
  const columns = Array.isArray(raw['columns']) ? raw['columns'].map((c) => String(c)) : []
  if (columns.length === 0) return null

  const rows = Array.isArray(raw['rows'])
    ? raw['rows'].slice(0, SAMPLE_ROW_LIMIT).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
    : []

  const out: ProfileSample = { columns, rows }

  if (isRecord(raw['values'])) {
    const values: Record<string, Array<{ value: string; count: number }>> = {}
    for (const [col, list] of Object.entries(raw['values'])) {
      if (!Array.isArray(list)) continue
      values[col] = list.filter(isRecord).map((e) => ({
        value: String(e['value'] ?? ''),
        count: Number(e['count'] ?? 0)
      }))
    }
    out.values = values
  }

  if (isRecord(raw['coverage'])) {
    const coverage: Record<string, { filled: number; total: number }> = {}
    for (const [col, e] of Object.entries(raw['coverage'])) {
      if (!isRecord(e)) continue
      coverage[col] = { filled: Number(e['filled'] ?? 0), total: Number(e['total'] ?? 0) }
    }
    out.coverage = coverage
  }

  return out
}
