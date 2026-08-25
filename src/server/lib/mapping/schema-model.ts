/*
 * SchemaModel — Lesezugriff auf das av-efi-schema (model.schema.json, erzeugt aus
 * dem LinkML-Schema von AV-EFI).
 *
 * Liefert Enums, Klassen-Slots und die je Klasse erlaubten same_as-/Identifier-
 * Resource-Typen. Damit sind Auswahllisten im Editor und das Gating (welche
 * Normdatenquelle an welchem Feld erlaubt ist) schemagetrieben statt fest
 * verdrahtet.
 *
 * Das Dokument wird hereingereicht, nicht selbst von der Platte gelesen: Die
 * Mappinglogik bleibt ohne Dateisystem und ohne Datenbank pruefbar. Wer das
 * Schema aus einer Datei laden will, liest es ausserhalb und ruft
 * createSchemaModel() damit auf.
 */

/** Rohform eines $defs-Eintrags, so wie das JSON-Schema ihn ablegt. */
interface SchemaDef {
  enum?: unknown[]
  properties?: Record<string, SchemaProp | undefined>
  required?: unknown[]
  [key: string]: unknown
}

interface SchemaProp {
  $ref?: string
  anyOf?: Array<{ $ref?: string }>
  items?: { $ref?: string; anyOf?: Array<{ $ref?: string }> }
  enum?: unknown[]
  pattern?: string
  [key: string]: unknown
}

export interface SchemaModel {
  /** Schemaversion, wie sie im Dokument steht (oder null). */
  readonly version: string | null
  /** Werte eines Enums, z. B. "TitleTypeEnum". Leer, wenn unbekannt. */
  enum(name: string): string[]
  /** Alle Enums als Name -> Werte. */
  enums(): Record<string, string[]>
  /** Ausgewaehlte Enums, damit die Oberflaeche nicht alle 91 Definitionen laden muss. */
  enumsSubset(names: readonly string[]): Record<string, string[]>
  /** Property-Namen einer Klasse. */
  classProps(className: string): string[]
  /** Pflicht-Properties einer Klasse. */
  required(className: string): string[]
  classExists(className: string): boolean
  /** Erlaubte Resource-Typen eines Listen-Properties, z. B. same_as. */
  resourceTypesFor(className: string, property: string): string[]
  /** Kurzform fuer same_as einer Klasse. */
  sameAsTypes(className: string): string[]
  /** category-Wert eines Resource-Typs, z. B. WikidataResource -> "avefi:WikidataResource". */
  resourceCategory(resourceType: string): string
  /** Pruefmuster der id eines Resource-Typs (oder null). */
  resourceIdPattern(resourceType: string): string | null
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Letztes Segment einer $ref-Angabe: "#/$defs/GNDResource" -> "GNDResource". */
function refName(ref: string): string {
  const cut = ref.lastIndexOf('/')
  return cut >= 0 ? ref.slice(cut + 1) : ref
}

/**
 * Baut ein SchemaModel aus dem geparsten model.schema.json.
 * Ein unbrauchbares Dokument fuehrt nicht zum Abbruch, sondern zu einem leeren
 * Modell: Ohne Schema wird milder geprueft, aber nichts blockiert.
 */
export function createSchemaModel(doc: unknown): SchemaModel {
  const root = asRecord(doc)
  const defsRaw = asRecord(root['$defs'])
  const defs = new Map<string, SchemaDef>()
  for (const [name, value] of Object.entries(defsRaw)) {
    if (typeof value === 'object' && value !== null) defs.set(name, value as SchemaDef)
  }
  const version = typeof root['version'] === 'string' ? root['version'] : null

  const def = (name: string): SchemaDef | undefined => defs.get(name)

  const prop = (className: string, property: string): SchemaProp | undefined => {
    const d = def(className)
    if (!d || !d.properties) return undefined
    const p = d.properties[property]
    return typeof p === 'object' && p !== null ? p : undefined
  }

  const model: SchemaModel = {
    version,

    enum(name) {
      return stringList(def(name)?.enum)
    },

    enums() {
      const out: Record<string, string[]> = {}
      for (const [name, d] of defs) {
        if (Array.isArray(d.enum)) out[name] = stringList(d.enum)
      }
      return out
    },

    enumsSubset(names) {
      const out: Record<string, string[]> = {}
      for (const n of names) out[n] = model.enum(n)
      return out
    },

    classProps(className) {
      const d = def(className)
      return d?.properties ? Object.keys(d.properties) : []
    },

    required(className) {
      return stringList(def(className)?.required)
    },

    classExists(className) {
      return def(className) !== undefined
    },

    resourceTypesFor(className, property) {
      const p = prop(className, property)
      if (!p) return []
      // Referenzen sammeln: anyOf-Liste (auch unterhalb von items) oder einzelner $ref.
      const refs: string[] = []
      const anyOf = p.items?.anyOf ?? p.anyOf
      if (Array.isArray(anyOf)) {
        for (const a of anyOf) if (typeof a?.$ref === 'string') refs.push(a.$ref)
      }
      for (const single of [p.items?.$ref, p.$ref]) {
        if (typeof single === 'string') refs.push(single)
      }
      const out: string[] = []
      for (const ref of refs) {
        const name = refName(ref)
        if (name.endsWith('Resource') && !out.includes(name)) out.push(name)
      }
      return out
    },

    sameAsTypes(className) {
      return model.resourceTypesFor(className, 'same_as')
    },

    resourceCategory(resourceType) {
      const p = prop(resourceType, 'category')
      const first = Array.isArray(p?.enum) ? p.enum[0] : undefined
      return typeof first === 'string' ? first : `avefi:${resourceType}`
    },

    resourceIdPattern(resourceType) {
      const p = prop(resourceType, 'id')
      return typeof p?.pattern === 'string' ? p.pattern : null
    }
  }

  return model
}

/** Leeres Modell — Rueckfallebene, solange kein Schema geladen ist. */
export const EMPTY_SCHEMA_MODEL: SchemaModel = createSchemaModel({})

let current: SchemaModel = EMPTY_SCHEMA_MODEL

/**
 * Hinterlegt das einmal geladene Schema fuer alle Aufrufer, die keines
 * durchreichen. Das Laden selbst gehoert nicht hierher.
 */
export function setSchemaModel(model: SchemaModel): void {
  current = model
}

export function getSchemaModel(): SchemaModel {
  return current
}
