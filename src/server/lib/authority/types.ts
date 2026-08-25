/*
 * Normdaten — gemeinsame Typen und die Frage, in welcher Form eine Quelle Namen
 * liefert.
 *
 * Das ist keine Nebensache, sondern der Kern des Fehlers aus dem PHP-Stand:
 *
 *   GND (lobid)  Personen invertiert — "Sielmann, Heinz".
 *                Koerperschaften und Orte in natuerlicher Form — "Bundesarchiv".
 *   Wikidata     durchgehend natuerliche Form — "Heinz Sielmann".
 *   VIAF         Personennamen invertiert, wie im Bibliothekskatalog —
 *                "Sielmann, Heinz, 1917-2006".
 *
 * Wer nur Zeichen gegen Zeichen vergleicht, findet in der GND keine einzige
 * Person, waehrend Koerperschaften und Orte treffen. Der Fehler faellt nicht
 * auf, weil er wie "nichts gefunden" aussieht. Deshalb wird beim Abgleich immer
 * auch die umgedrehte Form geprueft (siehe names.ts).
 */

/** Aktiv abfragbare Quellen. */
export type AuthoritySource = 'gnd' | 'wikidata' | 'viaf'

export const AUTHORITY_SOURCES: readonly AuthoritySource[] = ['gnd', 'wikidata', 'viaf'] as const

export function isAuthoritySource(v: string): v is AuthoritySource {
  return (AUTHORITY_SOURCES as readonly string[]).includes(v)
}

/** Art des gesuchten Datensatzes; bestimmt Typfilter und erlaubte Quellen. */
export type AuthorityKind = 'subject' | 'person' | 'corporate' | 'place' | 'genre' | 'work'

export const AUTHORITY_KINDS: readonly AuthorityKind[] =
  ['subject', 'person', 'corporate', 'place', 'genre', 'work'] as const

export function isAuthorityKind(v: string): v is AuthorityKind {
  return (AUTHORITY_KINDS as readonly string[]).includes(v)
}

/** In welcher Form eine Quelle Personennamen ausliefert. */
export type NameForm = 'natural' | 'inverted' | 'mixed'

/**
 * Namensform je Quelle. "mixed" heisst: haengt von der Art des Datensatzes ab —
 * Personen invertiert, alles andere natuerlich. Diese Tabelle ist der Grund,
 * warum comparableForms() beide Formen vergleicht.
 */
export const SOURCE_NAME_FORM: Readonly<Record<AuthoritySource, NameForm>> = {
  gnd: 'mixed',
  wikidata: 'natural',
  viaf: 'mixed'
}

/** kind -> AVefi-Klasse, deren same_as-Typen die erlaubten Quellen vorgeben. */
export const KIND_CLASS: Readonly<Record<AuthorityKind, string>> = {
  subject: 'Subject',
  person: 'Agent',
  corporate: 'Agent',
  place: 'GeographicName',
  genre: 'Genre',
  work: 'WorkVariant'
}

/** Quellschluessel -> Resource-Typ des Schemas. */
export const RESOURCE_TYPE: Readonly<Record<AuthoritySource, string>> = {
  gnd: 'GNDResource',
  wikidata: 'WikidataResource',
  viaf: 'VIAFResource'
}

export function resourceTypeOf(source: string): string | null {
  const key = source.toLowerCase()
  return isAuthoritySource(key) ? RESOURCE_TYPE[key] : null
}

export function sourceOfResourceType(resourceType: string): AuthoritySource | null {
  for (const s of AUTHORITY_SOURCES) {
    if (RESOURCE_TYPE[s] === resourceType) return s
  }
  return null
}

/** Ein Treffer einer Quelle, bereits vereinheitlicht. */
export interface AuthorityCandidate {
  source: AuthoritySource
  id: string
  /** So, wie die Quelle den Namen fuehrt — bei der GND also ggf. invertiert. */
  label: string
  description: string
  /** "Person" oder "CorporateBody", soweit die Quelle es hergibt. */
  agentType: string
  resourceType: string
  uri: string
}

/**
 * Ergebnis einer Aufloesung. Uebernommen wird nur bei Eindeutigkeit: genau ein
 * Treffer, dessen Name — natuerlich oder umgedreht — auf die Anfrage passt.
 *
 * Mehrdeutig heisst ausdruecklich "keine ID". Kein Treffer ist besser als ein
 * falscher: Im PHP-Stand bekam "Guenther Wolf" genau eine ID, weil nur ein
 * einziger Datensatz den Namen zufaellig in natuerlicher Form fuehrte und damit
 * als einziger exakt galt. Mit der umgedrehten Form greifen mehrere, die
 * Eindeutigkeitsregel schlaegt zu, und es wird nichts eingetragen.
 */
export interface AuthorityResolution {
  id: string
  label: string
  note: string
  /** true, wenn mehrere Namen passten und deshalb nichts uebernommen wurde. */
  ambiguous: boolean
  /** Was gefunden wurde — damit im Editor nicht nur eine Leerstelle steht. */
  candidates: AuthorityCandidate[]
}

export const EMPTY_RESOLUTION: AuthorityResolution = {
  id: '', label: '', note: '', ambiguous: false, candidates: []
}

/** Liest ein aus dem Zwischenspeicher geholtes Objekt vorsichtig ein. */
export function toResolution(raw: unknown): AuthorityResolution | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const candidates = Array.isArray(r['candidates']) ? r['candidates'] : []
  return {
    id: typeof r['id'] === 'string' ? r['id'] : '',
    label: typeof r['label'] === 'string' ? r['label'] : '',
    note: typeof r['note'] === 'string' ? r['note'] : '',
    ambiguous: r['ambiguous'] === true,
    candidates: candidates.filter((c): c is AuthorityCandidate =>
      typeof c === 'object' && c !== null && typeof (c as AuthorityCandidate).id === 'string')
  }
}
