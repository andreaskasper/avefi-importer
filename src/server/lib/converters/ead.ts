/*
 * EAD (Encoded Archival Description) 2002 und EAD3.
 *
 * Jede Komponenten-<did> ergibt einen Datensatz. Die <did> der Sammlung selbst
 * (direkt unter <archdesc>) wird uebersprungen — sie beschreibt den Bestand,
 * nicht ein Werk.
 */
import { basename } from 'node:path'
import type { Converter, ConvertedRecord, InternalContributor, InternalRecord } from './types'
import { attr, clean, minutes as minutesOf, nodes, parseFragment, streamElements, text, texts, year as yearOf } from './xml'

export const EAD_KEY = 'ead_v1'

const COMPONENT = /^c\d*$/

export class EadConverter implements Converter {
  readonly key = EAD_KEY

  async *convert(path: string): AsyncGenerator<ConvertedRecord> {
    const file = basename(path)
    let index = 0
    let sawDid = false

    for await (const chunk of streamElements(path, ['did'])) {
      sawDid = true
      // Nur Komponentenebene: das umschliessende Element muss c, c01, c02 … sein.
      if (!COMPONENT.test(chunk.parent)) continue
      index++
      yield { kind: 'internal', record: this.map(chunk.xml, file, index) }
    }

    if (!sawDid) throw new Error('Die Datei enthaelt kein <did>-Element — sie ist vermutlich kein EAD.')
    if (index === 0) {
      throw new Error('Die Datei enthaelt nur die Bestandsbeschreibung, aber keine Komponenten (<c>/<c01> …).')
    }
  }

  private map(fragment: string, file: string, index: number): InternalRecord {
    const parsed = parseFragment(fragment)
    const did = (parsed.did ?? parsed) as Record<string, unknown>

    const unitdate = nodes(did, 'unitdate')[0] ?? null
    const normal = attr(unitdate, 'normal')
    const dateText = unitdate ? clean(String(unitdate['#text'] ?? text(unitdate, '#text') ?? '')) : null
    const dateSource = normal !== null && normal !== '' ? normal : dateText
    const year = yearOf(dateSource)

    const signature = text(did, 'unitid')
    const extent = text(did, 'extent')
    const dimensions = text(did, 'dimensions')
    const repository = text(did, 'repository')
    const location = text(did, 'physloc')

    const carrier = extent ?? dimensions
    const duration = minutesOf(extent)
    const manifestations = []
    if (carrier !== null || (dateText !== null && dateText !== '')) {
      manifestations.push({
        ...(carrier !== null ? { carrier } : {}),
        ...(duration !== null ? { durationMin: duration } : {}),
        ...(dateText !== null && dateText !== '' ? { date: dateText } : {})
      })
    }

    const items = []
    if (repository !== null || signature !== null || location !== null) {
      items.push({
        ...(repository !== null ? { holdingInstitution: repository } : {}),
        ...(signature !== null ? { signature } : {}),
        ...(location !== null ? { location } : {})
      })
    }

    return {
      work: {
        title: text(did, 'unittitle'),
        additionalTitles: [],
        year,
        workType: null,
        country: null,
        genre: text(did, 'genreform'),
        language: text(did, 'language'),
        description: text(did, 'abstract'),
        contributors: this.contributors(did)
      },
      manifestations,
      items,
      source: { file, row: index }
    }
  }

  private contributors(did: Record<string, unknown>): InternalContributor[] {
    const out: InternalContributor[] = []
    for (const origination of nodes(did, 'origination')) {
      for (const tag of ['persname', 'corpname', 'famname']) {
        for (const node of nodes(origination, tag)) {
          const name = clean(String(node['#text'] ?? ''))
          if (name === '') continue
          const role = attr(node, 'role')
          out.push({ role: role && role !== '' ? role : 'origination', name })
        }
      }
      // Reiner Text ohne Unterelement.
      if (out.length === 0) {
        for (const t of texts(origination, '#text')) {
          if (t !== '') out.push({ role: 'origination', name: t })
        }
      }
    }
    return out
  }
}
