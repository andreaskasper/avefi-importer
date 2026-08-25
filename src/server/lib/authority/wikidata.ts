/*
 * Wikidata ueber die Suchschnittstelle wbsearchentities.
 *
 * NAMENSFORM: durchgehend natuerlich. Das Label einer Person ist "Heinz
 * Sielmann", nicht "Sielmann, Heinz" — Wikidata ist keine Katalogisierung,
 * sondern eine Wissensbasis. Deshalb trifft hier der schlichte Zeichenvergleich,
 * und genau deshalb fiel im PHP-Stand nicht auf, dass er bei der GND versagt:
 * Wikidata und die GND-Koerperschaften lieferten Treffer, nur GND-Personen nicht.
 *
 * Trotzdem laeuft der Abgleich auch hier ueber nameMatches(): Einzelne Labels
 * sind aus Katalogen importiert und stehen doch invertiert da.
 *
 * Ein Typfilter nach Art des Datensatzes ist nicht moeglich — wbsearchentities
 * liefert nur Label und Beschreibung. Die Beschreibung ("deutscher Tierfilmer")
 * bleibt deshalb das einzige Unterscheidungsmerkmal und wird mitgefuehrt.
 */

import type { AuthorityCandidate, AuthorityKind } from './types.js'
import type { FetchJson } from './http.js'
import { asArray, asRecord, asText } from './http.js'

export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
export const WIKIDATA_RESULT_SIZE = 8

/** Q-, P- und L-Kennungen; alles andere ist keine gueltige Entitaet. */
export const WIKIDATA_ID_PATTERN = /^[LPQ]\d+$/

export function wikidataSearchUrl(q: string, size: number = WIKIDATA_RESULT_SIZE): string {
  const p = new URLSearchParams({
    action: 'wbsearchentities',
    format: 'json',
    limit: String(size),
    language: 'de',
    uselang: 'de',
    type: 'item',
    search: q
  })
  return `${WIKIDATA_API}?${p.toString()}`
}

export function parseWikidata(payload: unknown, _kind: AuthorityKind): AuthorityCandidate[] {
  const out: AuthorityCandidate[] = []

  for (const raw of asArray(asRecord(payload)['search'])) {
    const s = asRecord(raw)
    const id = asText(s['id'])
    if (!WIKIDATA_ID_PATTERN.test(id)) continue
    const label = asText(s['label'])
    out.push({
      source: 'wikidata',
      id,
      label: label !== '' ? label : id,
      description: asText(s['description']),
      agentType: '',
      resourceType: 'WikidataResource',
      uri: asText(s['concepturi']) !== '' ? asText(s['concepturi']) : `https://www.wikidata.org/wiki/${id}`
    })
  }

  return out
}

export async function searchWikidata(
  q: string,
  kind: AuthorityKind,
  fetchJson: FetchJson
): Promise<AuthorityCandidate[]> {
  return parseWikidata(await fetchJson(wikidataSearchUrl(q)), kind)
}
