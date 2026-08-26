/*
 * Der Konvertierungsweg und die Normdaten.
 *
 * Die Bibliothek unter server/lib/authority/ war gebaut und geprueft, wurde im
 * Konvertierungsweg aber nie aufgerufen: runRow() bekam ein leeres
 * Dienste-Objekt. Folge im ausgelieferten Stand — nachgesehen in der erzeugten
 * Datei eines echten Imports: kein einziges same_as, und der country-Konverter
 * liess "DE" stehen, statt "Deutschland" einzutragen.
 *
 * Diese Tests fahren den Weg ab, den der Hintergrundprozess geht: Bedarf
 * sammeln, aufloesen, konvertieren. Kein Netz, keine Datenbank.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MappingJson, TransformStep } from '#shared/types/domain'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { collectAuthorityLookups } from '../../server/lib/mapping/runner.js'
import { previewRows, buildPreview } from '../../server/lib/mapping/preview.js'
import { resolveAuthorities } from '../../server/lib/authority/resolve.js'
import { authorityServices } from '../../server/lib/authority/index.js'
import { AuthorityNeeds } from '../../server/lib/converters/mappingBridge.js'
import { ProfileTableConverter, type ProfileForRun } from '../../server/lib/converters/profileTable.js'
import type { AuthorityRequest } from '../../server/lib/mapping/runner.js'
import type { CanonicalRecord } from '../../server/lib/converters/types.js'
import { gndAntwort, stubFetch, testSchema } from '../authority/fixtures.js'

function step(o: Record<string, unknown>): TransformStep {
  return o as unknown as TransformStep
}

/** Regie wird nachgeschlagen, Land wird normalisiert. Genau der Fall des Anwenders. */
function profil(): MappingJson {
  const m = emptyMapping(['Titel', 'Regie', 'Land'], '1.2.3')
  m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
  m.columns['Regie'] = {
    pre: [step({ op: 'trim' })],
    targets: [{ target: 'work.activity.directing', post: [step({ op: 'authority', source: 'gnd', kind: 'person' })] }]
  }
  m.columns['Land'] = {
    pre: [],
    targets: [{ target: 'work.production.place', post: [step({ op: 'country', unknown: 'keep' })] }]
  }
  return m
}

const CSV = 'Titel,Regie,Land\nSicherheit im Haushalt,Heinz Sielmann,DE\nZweiter Film,Heinz Sielmann,FR\n'

const zeilen = [
  { Titel: 'Sicherheit im Haushalt', Regie: 'Heinz Sielmann', Land: 'DE' },
  { Titel: 'Zweiter Film', Regie: 'Heinz Sielmann', Land: 'FR' }
]

function antwort() {
  return stubFetch(() => gndAntwort([{ id: '118614355', name: 'Sielmann, Heinz', beruf: 'Tierfilmer' }]))
}

let ordner = ''
let datei = ''

beforeAll(async () => {
  ordner = await mkdtemp(join(tmpdir(), 'avefi-konv-'))
  datei = join(ordner, 'filme.csv')
  await writeFile(datei, CSV, 'utf8')
})

afterAll(async () => {
  await rm(ordner, { recursive: true, force: true })
})

function profilFuerLauf(mapping: MappingJson): ProfileForRun {
  return { id: 7, name: 'Test', version: 1, base_format: 'csv', mapping_json: mapping }
}

async function konvertiere(mapping: MappingJson, options: {
  fetchJson?: ReturnType<typeof antwort>
  ohneAufloesung?: boolean
} = {}): Promise<{ records: CanonicalRecord[]; bedarf: AuthorityRequest[]; report: Record<string, unknown> }> {
  let bedarf: AuthorityRequest[] = []
  const converter = new ProfileTableConverter(profilFuerLauf(mapping), 'csv', {
    services: { schema: testSchema, ...authorityServices() },
    ...(options.ohneAufloesung === true ? {} : {
      prepareAuthorities: async (requests) => {
        bedarf = [...requests]
        const geloest = await resolveAuthorities(requests, {
          enabled: true,
          pauseMs: 0,
          schema: testSchema,
          ...(options.fetchJson !== undefined ? { fetchJson: options.fetchJson } : {})
        })
        return { schema: testSchema, ...authorityServices(geloest) }
      }
    })
  })

  const records: CanonicalRecord[] = []
  for await (const r of converter.convert(datei)) {
    if (r.kind === 'canonical') records.push(r.canonical)
  }
  return { records, bedarf, report: converter.report() }
}

/** Der erste Regie-Agent des Datensatzes. */
function regie(record: CanonicalRecord): Record<string, unknown> {
  const events = record.work['has_event'] as Array<Record<string, unknown>>
  const activity = (events[0]?.['has_activity'] as Array<Record<string, unknown>>)[0]
  return (activity?.['has_agent'] as Array<Record<string, unknown>>)[0] ?? {}
}

/** Der erste Produktionsort des Datensatzes. */
function ort(record: CanonicalRecord): Record<string, unknown> {
  const events = record.work['has_event'] as Array<Record<string, unknown>>
  return ((events[0]?.['located_in'] as Array<Record<string, unknown>>) ?? [])[0] ?? {}
}

describe('Der Konvertierungsweg loest Normdaten auf', () => {
  it('sammelt den Bedarf ueber die ganze Datei und fragt jeden Wert nur einmal', async () => {
    const fetchJson = antwort()
    const { bedarf } = await konvertiere(profil(), { fetchJson })

    expect(bedarf).toHaveLength(1)
    expect(bedarf[0]?.column).toBe('Regie')
    expect(bedarf[0]?.source).toBe('gnd')
    // Zwei Zeilen, derselbe Name: eine Abfrage, nicht zwei.
    expect(bedarf[0]?.values).toEqual(['heinz sielmann'])
    expect(fetchJson.calls).toHaveLength(1)
  })

  it('traegt die gefundene ID als same_as in den erzeugten Datensatz ein', async () => {
    const { records } = await konvertiere(profil(), { fetchJson: antwort() })
    expect(records).toHaveLength(2)

    const agent = regie(records[0] as CanonicalRecord)
    // Anreichern ersetzt den Wert nicht: der Name bleibt der Name.
    expect(agent['has_name']).toBe('Heinz Sielmann')
    expect(agent['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '118614355' }])
  })

  it('normalisiert den Laendernamen und haengt die GND-Nummer des Landes an', async () => {
    const { records } = await konvertiere(profil(), { fetchJson: antwort() })

    expect(ort(records[0] as CanonicalRecord)['has_name']).toBe('Deutschland')
    expect(ort(records[0] as CanonicalRecord)['same_as'])
      .toEqual([{ category: 'avefi:GNDResource', id: '4011882-4' }])
    expect(ort(records[1] as CanonicalRecord)['has_name']).toBe('Frankreich')
  })

  it('ohne Vorab-Aufloesung laeuft derselbe Lauf durch, nur ohne Normdaten-IDs', async () => {
    const { records } = await konvertiere(profil(), { ohneAufloesung: true })

    const agent = regie(records[0] as CanonicalRecord)
    expect(agent['has_name']).toBe('Heinz Sielmann')
    expect(agent['same_as']).toBeUndefined()
    // Laender brauchen kein Netz und wirken trotzdem.
    expect(ort(records[0] as CanonicalRecord)['has_name']).toBe('Deutschland')
  })

  it('meldet im Bericht, wie viele Werte aufzuloesen waren', async () => {
    const { report } = await konvertiere(profil(), { fetchJson: antwort() })
    expect(report.authorityValues).toBe(1)
    expect(report.authorityValuesDropped).toBe(0)
  })
})

describe('Vorschau und Konvertierung rechnen dasselbe', () => {
  it('derselbe Datensatz kommt aus beiden Wegen', async () => {
    const mapping = profil()
    const fetchJson = antwort()

    // Der Weg der Vorschau: Zeilen auswaehlen, Bedarf sammeln, aufloesen, rechnen.
    const input = { columns: ['Titel', 'Regie', 'Land'], rows: zeilen, rowCount: zeilen.length }
    const geloest = await resolveAuthorities(
      collectAuthorityLookups(mapping, previewRows(input)),
      { enabled: true, pauseMs: 0, schema: testSchema, fetchJson }
    )
    const vorschau = buildPreview(input, mapping, { schema: testSchema, ...authorityServices(geloest) })

    // Der Weg der Konvertierung.
    const { records } = await konvertiere(mapping, { fetchJson: antwort() })

    const ausVorschau = vorschau.canonical
    expect(ausVorschau).not.toBeNull()

    // Die Kennungen tragen die Zeilennummer und unterscheiden sich planmaessig;
    // verglichen wird alles andere.
    const ohneKennung = (r: CanonicalRecord | null): unknown => {
      const kopie = JSON.parse(JSON.stringify(r)) as CanonicalRecord
      delete kopie.work['has_identifier']
      for (const m of kopie.manifestations) delete m['has_identifier']
      for (const i of kopie.items) delete i['has_identifier']
      return kopie
    }

    expect(ohneKennung(ausVorschau as CanonicalRecord)).toEqual(ohneKennung(records[0] as CanonicalRecord))
  })
})

describe('Bedarf buendelweise sammeln', () => {
  const req = (values: string[]): AuthorityRequest =>
    ({ column: 'Regie', source: 'gnd', kind: 'person', values })

  it('fasst mehrere Buendel zu einer Anfrage zusammen und entdoppelt', () => {
    const needs = new AuthorityNeeds()
    needs.add([req(['a', 'b'])])
    needs.add([req(['b', 'c'])])

    expect(needs.all()).toHaveLength(1)
    expect(needs.all()[0]?.values).toEqual(['a', 'b', 'c'])
    expect(needs.size).toBe(3)
    expect(needs.dropped).toBe(0)
  })

  it('haelt die Obergrenze ein und sagt, wie viele Werte liegen blieben', () => {
    const needs = new AuthorityNeeds(2)
    needs.add([req(['a', 'b', 'c', 'd'])])

    expect(needs.all()[0]?.values).toEqual(['a', 'b'])
    expect(needs.size).toBe(2)
    expect(needs.dropped).toBe(2)
  })

  it('haelt Spalten und Quellen auseinander', () => {
    const needs = new AuthorityNeeds()
    needs.add([req(['a']), { column: 'Buch', source: 'gnd', kind: 'person', values: ['a'] }])
    needs.add([{ column: 'Regie', source: 'wikidata', kind: 'person', values: ['a'] }])

    expect(needs.all()).toHaveLength(3)
  })
})
