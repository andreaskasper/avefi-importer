/*
 * GND ueber lobid.org.
 *
 * NAMENSFORM: gemischt. Personen fuehrt die GND invertiert — "Sielmann, Heinz".
 * Koerperschaften, Orte und Schlagwoerter stehen in natuerlicher Form —
 * "Bundesarchiv", "Berlin". Genau daran ist der PHP-Stand gescheitert: ein
 * reiner Zeichenvergleich gegen "Heinz Sielmann" traf keine einzige Person,
 * waehrend Koerperschaften und Orte trafen. Der Abgleich laeuft deshalb ueber
 * nameMatches() aus names.ts, das die umgedrehte Form mitprueft.
 *
 * lobid liefert preferredName als Anzeigeform; die Art des Datensatzes steht in
 * type[] ("DifferentiatedPerson", "CorporateBody", "TerritorialCorporateBodyOrAdministrativeUnit" …),
 * weshalb auf Teilstrings geprueft wird und nicht auf Gleichheit.
 */

import type { AuthorityCandidate, AuthorityKind } from './types.js'
import type { FetchJson } from './http.js'
import { asArray, asRecord, asText } from './http.js'

/**
 * Art eines GND-Datensatzes aus type[].
 *
 * Die Reihenfolge ist wichtig: Orte kommen als
 * "TerritorialCorporateBodyOrAdministrativeUnit" daher — der Name enthaelt
 * "CorporateBody", gemeint ist aber eine Stadt oder ein Land. Wer nur auf
 * Teilstrings prueft, haelt Berlin fuer eine Koerperschaft. Deshalb wird der Ort
 * zuerst erkannt.
 */
export type GndCategory = 'person' | 'place' | 'corporate' | 'subject' | 'other'

export function gndCategory(types: readonly string[]): GndCategory {
  if (typeMatches(types, 'Person')) return 'person'
  if (typeMatches(types, 'PlaceOrGeographicName') || typeMatches(types, 'Territorial')) return 'place'
  if (typeMatches(types, 'CorporateBody') || typeMatches(types, 'Family')) return 'corporate'
  if (typeMatches(types, 'SubjectHeading')) return 'subject'
  return 'other'
}

/** kind -> zugelassene Arten (leer = kein Filter). */
const ALLOWED: Readonly<Record<AuthorityKind, readonly GndCategory[]>> = {
  subject: ['subject'],
  person: ['person'],
  corporate: ['corporate'],
  place: ['place'],
  genre: ['subject'],
  work: []
}

export const GND_SEARCH_URL = 'https://lobid.org/gnd/search'
export const GND_RESULT_SIZE = 10

export function gndSearchUrl(q: string, size: number = GND_RESULT_SIZE): string {
  return `${GND_SEARCH_URL}?format=json&size=${size}&q=${encodeURIComponent(q)}`
}

function typeMatches(types: readonly string[], needle: string): boolean {
  const lower = needle.toLowerCase()
  return types.some((t) => t.toLowerCase().includes(lower))
}

/** Erste brauchbare Kurzbeschreibung eines Datensatzes. */
function describe(m: Record<string, unknown>, types: readonly string[]): string {
  const bits: string[] = []
  for (const key of [
    'dateOfBirthAndDeath', 'professionOrOccupation', 'placeOfBirth',
    'biographicalOrHistoricalInformation', 'definition'
  ]) {
    const v = m[key]
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      const first = v[0]
      const text = typeof first === 'string' ? first : asText(asRecord(first)['label'])
      if (text !== '') { bits.push(text); break }
    } else if (typeof v === 'string') {
      bits.push(v)
      break
    }
  }
  // "AuthorityResource" steht bei jedem Datensatz und sagt nichts.
  const human = types.find((t) => !t.includes('AuthorityResource'))
  if (human !== undefined) bits.unshift(human)
  return bits.slice(0, 2).join(' · ').trim()
}

export function parseGnd(payload: unknown, kind: AuthorityKind): AuthorityCandidate[] {
  const allowed = ALLOWED[kind]
  const out: AuthorityCandidate[] = []

  for (const raw of asArray(asRecord(payload)['member'])) {
    const m = asRecord(raw)
    const types = asArray(m['type']).map((t) => asText(t)).filter((t) => t !== '')
    const category = gndCategory(types)
    if (allowed.length > 0 && !allowed.includes(category)) continue
    const id = asText(m['gndIdentifier'])
    if (id === '') continue
    const label = asText(m['preferredName'])
    out.push({
      source: 'gnd',
      id,
      label: label !== '' ? label : id,
      description: describe(m, types),
      agentType: category === 'person' ? 'Person' : category === 'corporate' ? 'CorporateBody' : '',
      resourceType: 'GNDResource',
      uri: asText(m['id']) !== '' ? asText(m['id']) : `https://d-nb.info/gnd/${id}`
    })
  }

  return out
}

export async function searchGnd(
  q: string,
  kind: AuthorityKind,
  fetchJson: FetchJson
): Promise<AuthorityCandidate[]> {
  return parseGnd(await fetchJson(gndSearchUrl(q)), kind)
}
