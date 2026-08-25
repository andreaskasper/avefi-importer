/*
 * Nachschlagen fuer den Editor — Kandidaten und Einzelheiten.
 *
 * Unterschied zur Vorab-Aufloesung (resolve.ts): Hier will ein Mensch sehen, was
 * es gibt, und selbst auswaehlen. Deshalb wird nicht auf Eindeutigkeit gefiltert
 * und bewusst NICHT der Zwischenspeicher benutzt — der enthaelt das Ergebnis der
 * Automatik, nicht die Auswahl.
 *
 * Zur Namensform siehe types.ts: Was hier zurueckkommt, steht so da, wie die
 * Quelle es fuehrt — bei GND-Personen also invertiert. Ob ein Kandidat exakt
 * passt, entscheidet nameMatches(), das die umgedrehte Form mitprueft.
 */

import type { AuthorityCandidate, AuthorityKind, AuthoritySource } from './types.js'
import type { FetchJson } from './http.js'
import type { SchemaModel } from '../mapping/schema-model.js'
import { AUTHORITY_SOURCES, isAuthorityKind, isAuthoritySource } from './types.js'
import { asArray, asRecord, asText, createFetchJson } from './http.js'
import { compareForm, nameMatches } from './names.js'
import { searchGnd } from './gnd.js'
import { searchWikidata } from './wikidata.js'
import { searchViaf } from './viaf.js'
import { sourceAllowed } from './resolve.js'

/** Kuerzeste Anfrage, die noch sinnvoll ist. */
export const MIN_QUERY_LENGTH = 2
export const MAX_CANDIDATE_RESULTS = 24

export interface ScoredCandidate extends AuthorityCandidate {
  /** Passt der Name — natuerlich oder umgedreht — genau auf die Anfrage? */
  exact: boolean
}

export interface SearchOptions {
  sources?: readonly AuthoritySource[]
  fetchJson?: FetchJson
  schema?: SchemaModel
  limit?: number
  onWarn?: (message: string) => void
}

/**
 * Kandidaten zu einem Namen, unabhaengig von der Eindeutigkeit.
 * Faellt eine Quelle aus, liefern die anderen trotzdem.
 */
export async function authorityCandidates(
  name: string,
  kind: string,
  options: SearchOptions = {}
): Promise<ScoredCandidate[]> {
  const q = name.trim()
  const k: AuthorityKind = isAuthorityKind(kind) ? kind : 'subject'
  if (q.length < MIN_QUERY_LENGTH) return []

  const fetchJson = options.fetchJson ?? createFetchJson()
  const wanted = (options.sources ?? AUTHORITY_SOURCES).filter((s) => isAuthoritySource(s))
  const norm = compareForm(q)
  const out: ScoredCandidate[] = []

  for (const source of wanted) {
    if (!sourceAllowed(source, k, options.schema)) continue
    try {
      const found = source === 'gnd'
        ? await searchGnd(q, k, fetchJson)
        : source === 'wikidata'
          ? await searchWikidata(q, k, fetchJson)
          : await searchViaf(q, k, fetchJson)
      for (const c of found) out.push({ ...c, exact: nameMatches(c.label, norm) })
    } catch (e) {
      options.onWarn?.(`${source}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  out.sort((a, b) => Number(b.exact) - Number(a.exact))
  return out.slice(0, options.limit ?? MAX_CANDIDATE_RESULTS)
}

/** Welche Quellen bei dieser Art von Feld ueberhaupt in Frage kommen. */
export function sourcesForKind(kind: string, schema?: SchemaModel): AuthoritySource[] {
  const k: AuthorityKind = isAuthorityKind(kind) ? kind : 'subject'
  return AUTHORITY_SOURCES.filter((s) => sourceAllowed(s, k, schema))
}

/* ------------------------------------------------------------- Einzelheiten */

export interface AuthorityDetail {
  source: string
  id: string
  title: string
  description: string
  extract: string
  image: string
  url: string
  wikiUrl: string
}

/** Muster der Kennungen; alles andere wird gar nicht erst abgefragt. */
const ID_PATTERN: Readonly<Record<AuthoritySource, RegExp>> = {
  gnd: /^[-\dX]+$/,
  wikidata: /^[LPQ]\d+$/,
  viaf: /^\d+$/
}

function emptyDetail(source: string, id: string): AuthorityDetail {
  return { source, id, title: id, description: '', extract: '', image: '', url: '', wikiUrl: '' }
}

/**
 * Ausfuehrliche Angaben zu einem Treffer, samt Wikipedia-Auszug, soweit es einen
 * gibt. Bei Fehlschlag kommt der leere Datensatz zurueck, keine Ausnahme.
 */
export async function authorityDetail(
  source: string,
  id: string,
  options: { fetchJson?: FetchJson; onWarn?: (m: string) => void } = {}
): Promise<AuthorityDetail> {
  const s = source.trim().toLowerCase()
  if (!isAuthoritySource(s) || !ID_PATTERN[s].test(id)) return emptyDetail(s, id)
  const fetchJson = options.fetchJson ?? createFetchJson()

  try {
    if (s === 'wikidata') return await detailWikidata(id, fetchJson)
    if (s === 'gnd') return await detailGnd(id, fetchJson)
    return await detailViaf(id, fetchJson)
  } catch (e) {
    options.onWarn?.(`${s}/${id}: ${e instanceof Error ? e.message : String(e)}`)
    return emptyDetail(s, id)
  }
}

interface WikiSummary { extract: string; image: string; url: string }

async function wikiSummary(lang: string, title: string, fetchJson: FetchJson): Promise<WikiSummary> {
  const l = /^[a-z]{2}$/.test(lang) ? lang : 'de'
  const url = `https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  try {
    const j = asRecord(await fetchJson(url))
    return {
      extract: asText(j['extract']),
      image: asText(asRecord(j['thumbnail'])['source']),
      url: asText(asRecord(asRecord(j['content_urls'])['desktop'])['page'])
    }
  } catch {
    return { extract: '', image: '', url: '' }
  }
}

async function detailWikidata(id: string, fetchJson: FetchJson): Promise<AuthorityDetail> {
  const p = new URLSearchParams({
    action: 'wbgetentities', format: 'json', ids: id,
    props: 'labels|descriptions|sitelinks|claims', languages: 'de|en'
  })
  const j = asRecord(await fetchJson(`https://www.wikidata.org/w/api.php?${p.toString()}`))
  const e = asRecord(asRecord(j['entities'])[id])
  const labels = asRecord(e['labels'])
  const descs = asRecord(e['descriptions'])
  const title = asText(asRecord(labels['de'])['value']) || asText(asRecord(labels['en'])['value']) || id
  const description = asText(asRecord(descs['de'])['value']) || asText(asRecord(descs['en'])['value'])

  const sitelinks = asRecord(e['sitelinks'])
  const de = asText(asRecord(sitelinks['dewiki'])['title'])
  const en = asText(asRecord(sitelinks['enwiki'])['title'])
  let summary: WikiSummary = { extract: '', image: '', url: '' }
  if (de !== '') summary = await wikiSummary('de', de, fetchJson)
  else if (en !== '') summary = await wikiSummary('en', en, fetchJson)

  let image = summary.image
  if (image === '') {
    const p18 = asArray(asRecord(e['claims'])['P18'])[0]
    const file = asText(asRecord(asRecord(asRecord(p18)['mainsnak'])['datavalue'])['value'])
    if (file !== '') {
      image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=320`
    }
  }

  return {
    source: 'wikidata', id, title, description,
    extract: summary.extract, image, url: `https://www.wikidata.org/wiki/${id}`, wikiUrl: summary.url
  }
}

async function detailGnd(id: string, fetchJson: FetchJson): Promise<AuthorityDetail> {
  const j = asRecord(await fetchJson(`https://lobid.org/gnd/${encodeURIComponent(id)}.json`))
  const title = asText(j['preferredName']) !== '' ? asText(j['preferredName']) : id

  const bits: string[] = []
  for (const p of asArray(j['professionOrOccupation'])) {
    const label = asText(asRecord(p)['label'])
    if (label !== '') bits.push(label)
    if (bits.length >= 2) break
  }
  const born = asText(asArray(j['dateOfBirth'])[0])
  const died = asText(asArray(j['dateOfDeath'])[0])
  if (born !== '' || died !== '') {
    bits.push(`* ${born !== '' ? born : '?'}${died !== '' ? ` † ${died}` : ''}`)
  }
  let description = bits.filter((b) => b !== '').join(' · ').trim()
  if (description === '') {
    for (const key of ['definition', 'biographicalOrHistoricalInformation']) {
      const first = asArray(j[key])[0]
      const text = typeof first === 'string' ? first : asText(asRecord(first)['label'])
      if (text !== '') { description = text; break }
    }
  }

  const depiction = asRecord(asArray(j['depiction'])[0])
  let image = asText(depiction['thumbnail']) !== '' ? asText(depiction['thumbnail']) : asText(depiction['id'])
  let extract = ''
  let wikiUrl = ''
  for (const sa of asArray(j['sameAs'])) {
    const u = asText(asRecord(sa)['id'])
    const m = u.match(/^https?:\/\/de\.wikipedia\.org\/wiki\/(.+)$/)
    if (m === null) continue
    const summary = await wikiSummary('de', decodeURIComponent(m[1] ?? ''), fetchJson)
    extract = summary.extract
    if (image === '') image = summary.image
    wikiUrl = summary.url
    break
  }

  return {
    source: 'gnd', id, title, description, extract, image,
    url: asText(j['id']) !== '' ? asText(j['id']) : `https://d-nb.info/gnd/${id}`,
    wikiUrl
  }
}

async function detailViaf(id: string, fetchJson: FetchJson): Promise<AuthorityDetail> {
  const j = asRecord(await fetchJson(`https://viaf.org/viaf/${encodeURIComponent(id)}/viaf.json`))
  const data = asRecord(j['mainHeadings'])['data']
  const title = Array.isArray(data)
    ? asText(asRecord(data[0])['text'])
    : asText(asRecord(data)['text'])

  return {
    source: 'viaf', id,
    title: title !== '' ? title : id,
    description: 'VIAF-Normdatensatz',
    extract: '', image: '',
    url: `https://viaf.org/viaf/${id}`, wikiUrl: ''
  }
}
