/*
 * MARC 21 in MARCXML. Ein <record> ergibt einen Datensatz.
 *
 * Die Datei wird im Datenstrom in <record>-Bruchstuecke zerlegt und jedes
 * Bruchstueck einzeln geparst; eine Verbunddatei mit zehntausend Datensaetzen
 * muss dafuer nicht vollstaendig im Speicher stehen.
 */
import { basename } from 'node:path'
import type { Converter, ConvertedRecord, InternalContributor, InternalRecord } from './types'
import { clean, parseFragment, streamElements, trimMarcPunctuation, year as yearOf, minutes as minutesOf } from './xml'

export const MARCXML_KEY = 'marcxml_v1'

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

function textOf(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number') return clean(String(v))
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('#text' in o) return clean(String(o['#text'] ?? ''))
  }
  return ''
}

interface MarcRecord {
  datafields: Array<{ tag: string; subfields: Array<{ code: string; value: string }> }>
  controlfields: Array<{ tag: string; value: string }>
}

function readRecord(fragment: string): MarcRecord {
  const parsed = parseFragment(fragment)
  const record = (parsed.record ?? parsed) as Record<string, unknown>

  const datafields = asArray(record.datafield).map((df) => {
    const o = (df ?? {}) as Record<string, unknown>
    return {
      tag: String(o['@_tag'] ?? ''),
      subfields: asArray(o.subfield).map((sf) => {
        const s = (sf ?? {}) as Record<string, unknown>
        return { code: String(s['@_code'] ?? ''), value: textOf(sf) }
      })
    }
  })

  const controlfields = asArray(record.controlfield).map((cf) => {
    const o = (cf ?? {}) as Record<string, unknown>
    return { tag: String(o['@_tag'] ?? ''), value: typeof cf === 'string' ? cf : String(o['#text'] ?? '') }
  })

  return { datafields, controlfields }
}

function sub(rec: MarcRecord, tag: string, code: string): string | null {
  for (const df of rec.datafields) {
    if (df.tag !== tag) continue
    for (const sf of df.subfields) {
      if (sf.code === code && sf.value !== '') return sf.value
    }
  }
  return null
}

function control(rec: MarcRecord, tag: string): string | null {
  const cf = rec.controlfields.find((c) => c.tag === tag)
  return cf && cf.value !== '' ? cf.value : null
}

const CONTRIBUTOR_TAGS = ['100', '110', '111', '700', '710', '711']

function contributors(rec: MarcRecord): InternalContributor[] {
  const out: InternalContributor[] = []
  for (const df of rec.datafields) {
    if (!CONTRIBUTOR_TAGS.includes(df.tag)) continue
    const name = df.subfields.find((s) => s.code === 'a' && s.value !== '')?.value
    if (name === undefined) continue
    const role =
      df.subfields.find((s) => s.code === 'e' && s.value !== '')?.value ??
      df.subfields.find((s) => s.code === '4' && s.value !== '')?.value ??
      'contributor'
    out.push({ role, name: trimMarcPunctuation(name) })
  }
  return out
}

export class MarcXmlConverter implements Converter {
  readonly key = MARCXML_KEY

  async *convert(path: string): AsyncGenerator<ConvertedRecord> {
    const file = basename(path)
    let index = 0
    for await (const chunk of streamElements(path, ['record'])) {
      index++
      yield { kind: 'internal', record: this.map(readRecord(chunk.xml), file, index) }
    }
    if (index === 0) throw new Error('Die Datei enthaelt kein <record>-Element — sie ist vermutlich kein MARC-XML.')
  }

  private map(rec: MarcRecord, file: string, index: number): InternalRecord {
    const mainTitle = sub(rec, '245', 'a')
    const subTitle = sub(rec, '245', 'b')
    const title =
      mainTitle === null
        ? null
        : trimMarcPunctuation(subTitle === null ? mainTitle : `${trimMarcPunctuation(mainTitle)} ${subTitle}`)

    const cf008 = control(rec, '008')
    const dateText = sub(rec, '264', 'c') ?? sub(rec, '260', 'c')
    const year =
      yearOf(dateText) ?? (cf008 !== null && cf008.length >= 11 ? yearOf(cf008.slice(7, 11)) : null)

    const language =
      sub(rec, '041', 'a') ?? (cf008 !== null && cf008.length >= 38 ? cf008.slice(35, 38).trim() || null : null)
    const country =
      sub(rec, '044', 'a') ?? (cf008 !== null && cf008.length >= 18 ? cf008.slice(15, 18).trim() || null : null)

    const extent = sub(rec, '300', 'a')
    const manifestations = []
    if (extent !== null || dateText !== null) {
      const duration = minutesOf(extent)
      manifestations.push({
        ...(extent !== null ? { carrier: extent } : {}),
        ...(duration !== null ? { durationMin: duration } : {}),
        ...(dateText !== null ? { date: dateText } : {})
      })
    }

    const institution = sub(rec, '852', 'a')
    const signature = sub(rec, '852', 'j') ?? sub(rec, '852', 'h')
    const location = sub(rec, '852', 'c') ?? sub(rec, '852', 'b')
    const items = []
    if (institution !== null || signature !== null || location !== null) {
      items.push({
        ...(institution !== null ? { holdingInstitution: institution } : {}),
        ...(signature !== null ? { signature } : {}),
        ...(location !== null ? { location } : {})
      })
    }

    return {
      work: {
        title,
        additionalTitles: [],
        year,
        workType: null,
        country,
        genre: sub(rec, '655', 'a'),
        language,
        description: sub(rec, '520', 'a'),
        contributors: contributors(rec)
      },
      manifestations,
      items,
      source: { file, row: index }
    }
  }
}
