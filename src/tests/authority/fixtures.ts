/* Gemeinsame Testdaten der Normdaten-Anbindung. Kein Test geht ins Netz. */

import type { FetchJson } from '../../server/lib/authority/http.js'
import { createSchemaModel } from '../../server/lib/mapping/schema-model.js'

/**
 * Ein fetch-Ersatz, der beim ersten Aufruf durchfaellt. Damit laesst sich
 * beweisen, dass gar keine Abfrage stattgefunden hat.
 */
export const verbotenerNetzzugriff: FetchJson = async (url: string) => {
  throw new Error(`Es haette keine Netzabfrage geben duerfen: ${url}`)
}

/** Zaehlt die Aufrufe und liefert je URL eine vorbereitete Antwort. */
export function stubFetch(
  antworten: Record<string, unknown> | ((url: string) => unknown)
): FetchJson & { calls: string[] } {
  const calls: string[] = []
  const fn = async (url: string): Promise<unknown> => {
    calls.push(url)
    if (typeof antworten === 'function') return antworten(url)
    for (const [needle, value] of Object.entries(antworten)) {
      if (url.includes(needle)) {
        if (value instanceof Error) throw value
        return value
      }
    }
    return {}
  }
  return Object.assign(fn, { calls })
}

/** Antwort von lobid.org/gnd/search. */
export function gndAntwort(
  eintraege: Array<{ id: string; name: string; type?: string[]; beruf?: string }>
): unknown {
  return {
    member: eintraege.map((e) => ({
      id: `https://d-nb.info/gnd/${e.id}`,
      gndIdentifier: e.id,
      preferredName: e.name,
      type: e.type ?? ['DifferentiatedPerson', 'Person', 'AuthorityResource'],
      ...(e.beruf !== undefined ? { professionOrOccupation: [{ label: e.beruf }] } : {})
    }))
  }
}

/** Antwort von wbsearchentities. */
export function wikidataAntwort(
  eintraege: Array<{ id: string; label: string; description?: string }>
): unknown {
  return {
    search: eintraege.map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description ?? '',
      concepturi: `http://www.wikidata.org/entity/${e.id}`
    }))
  }
}

/** Antwort von VIAF AutoSuggest. */
export function viafAntwort(
  eintraege: Array<{ id: string; term: string; nametype?: string }>
): unknown {
  return {
    result: eintraege.map((e) => ({
      viafid: e.id,
      term: e.term,
      nametype: e.nametype ?? 'personal'
    }))
  }
}

/**
 * Kleines Schema mit genau den same_as-Typen, die hier gebraucht werden.
 * Das echte model.schema.json wird zur Laufzeit hereingereicht; die Tests
 * sollen davon nicht abhaengen.
 */
export const testSchema = createSchemaModel({
  version: '1.2.3',
  $defs: {
    GNDResource: {
      properties: { category: { enum: ['avefi:GNDResource'] }, id: { pattern: '^[-\\dX]+$' } }
    },
    WikidataResource: {
      properties: { category: { enum: ['avefi:WikidataResource'] }, id: { pattern: '^Q\\d+$' } }
    },
    VIAFResource: {
      properties: { category: { enum: ['avefi:VIAFResource'] }, id: { pattern: '^\\d+$' } }
    },
    LocalResource: { properties: { category: { enum: ['avefi:LocalResource'] } } },
    Agent: {
      properties: {
        same_as: { items: { anyOf: [{ $ref: '#/$defs/GNDResource' }, { $ref: '#/$defs/WikidataResource' }] } }
      }
    },
    GeographicName: {
      properties: { same_as: { items: { anyOf: [{ $ref: '#/$defs/GNDResource' }] } } }
    },
    Subject: {
      properties: { same_as: { items: { anyOf: [{ $ref: '#/$defs/GNDResource' }] } } }
    }
  }
})
