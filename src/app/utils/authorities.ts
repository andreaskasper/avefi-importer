/*
 * Bestaetigte Normdatenzuordnungen im Profil setzen und entfernen.
 *
 * Je Quellwert kann es mehrere geben — eine je Normdatenquelle. Frueher stand
 * dort genau ein Eintrag: Wer erst GND und dann VIAF bestaetigte, ueberschrieb
 * damit die erste Entscheidung, ohne dass etwas darauf hinwies. Genau daher kam
 * der Eindruck, ein Zweig vertrage nur eine Normdatenquelle.
 *
 * Eine Stelle fuer beide Oberflaechen: den Zuordnungseditor und die
 * Normdatenseite. Zwei Umsetzungen derselben Regel waeren zwei Wahrheiten.
 */
import type { ColumnMapping, ConfirmedAuthorityEntry } from '#shared/types/domain'

/** Der Ressourcentyp eines Eintrags, notfalls aus dem Quellschluessel. */
export function resourceTypeOfEntry(entry: ConfirmedAuthorityEntry): string {
  if (entry.type.endsWith('Resource')) return entry.type
  switch (entry.type.toLowerCase()) {
    case 'gnd': return 'GNDResource'
    case 'wikidata': return 'WikidataResource'
    case 'viaf': return 'VIAFResource'
    case 'filmportal': return 'FilmportalResource'
    case 'eidr': return 'EIDRResource'
    default: return 'GNDResource' // Eintraege aus der Zeit ohne Quellbezug sind GND
  }
}

export function resourceTypeOfSource(source: string): string {
  return resourceTypeOfEntry({ id: '', type: source })
}

function asList(raw: ConfirmedAuthorityEntry | ConfirmedAuthorityEntry[] | undefined): ConfirmedAuthorityEntry[] {
  if (raw === undefined) return []
  return Array.isArray(raw) ? [...raw] : [raw]
}

/** Die bestaetigte Zuordnung dieses Werts fuer diese Quelle. */
export function confirmedFor(
  spec: ColumnMapping,
  value: string,
  source: string
): ConfirmedAuthorityEntry | undefined {
  const wanted = resourceTypeOfSource(source)
  return asList(spec.authorities?.[value]).find((e) => resourceTypeOfEntry(e) === wanted)
}

/**
 * Zuordnung setzen: ersetzt die Entscheidung zu DIESER Quelle und laesst die
 * anderen stehen.
 */
export function setConfirmed(spec: ColumnMapping, value: string, entry: ConfirmedAuthorityEntry): void {
  spec.authorities ??= {}
  const type = resourceTypeOfEntry(entry)
  const list = asList(spec.authorities[value]).filter((e) => resourceTypeOfEntry(e) !== type)
  list.push(entry)
  spec.authorities[value] = list.length === 1 ? (list[0] as ConfirmedAuthorityEntry) : list
}

/**
 * Zuordnung zuruecknehmen. Ohne Quelle faellt der ganze Wert weg, mit Quelle
 * nur deren Entscheidung.
 */
export function clearConfirmed(spec: ColumnMapping, value: string, source?: string): void {
  const store = spec.authorities
  if (store === undefined) return
  if (source === undefined) {
    delete store[value]
    return
  }
  const wanted = resourceTypeOfSource(source)
  const list = asList(store[value]).filter((e) => resourceTypeOfEntry(e) !== wanted)
  if (list.length === 0) delete store[value]
  else store[value] = list.length === 1 ? (list[0] as ConfirmedAuthorityEntry) : list
}
