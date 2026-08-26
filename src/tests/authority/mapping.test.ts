/*
 * Zusammenspiel mit dem Mappingkern.
 *
 * Der Kern schlaegt nicht selbst nach: collectAuthorityLookups() sagt, was
 * gebraucht wird, resolveAuthorities() loest es auf, runRow() bekommt das
 * Ergebnis als synchrone Funktion hereingereicht. Dieser Test faehrt genau
 * diesen Weg ab — ohne Netz und ohne Datenbank.
 */

import { describe, expect, it } from 'vitest'
import type { MappingJson, TransformStep } from '#shared/types/domain'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { collectAuthorityLookups, runRow } from '../../server/lib/mapping/runner.js'
import { getTarget } from '../../server/lib/mapping/targets.js'
import { acceptsAuthority } from '../../server/lib/mapping/builder.js'
import { resolveAuthorities } from '../../server/lib/authority/resolve.js'
import { authorityServices } from '../../server/lib/authority/index.js'
import { gndAntwort, stubFetch, testSchema } from './fixtures.js'

function step(o: Record<string, unknown>): TransformStep {
  return o as unknown as TransformStep
}

function regieProfil(): MappingJson {
  const m = emptyMapping(['Regie'], '1.2.3')
  m.columns['Regie'] = {
    pre: [{ op: 'trim' }, step({ op: 'split', sep: ';' }), step({ op: 'authority', source: 'gnd', kind: 'person' })],
    targets: [{ target: 'work.activity.directing', post: [] }]
  }
  return m
}

const zeilen = [
  { Regie: ' Heinz Sielmann; Günther Wolf ' },
  { Regie: 'Heinz Sielmann' }
]

describe('Bedarf sammeln und aufloesen', () => {
  it('der gesammelte Bedarf enthaelt die getrennten und getrimmten Werte', () => {
    const bedarf = collectAuthorityLookups(regieProfil(), zeilen)
    expect(bedarf).toHaveLength(1)
    expect(bedarf[0]?.column).toBe('Regie')
    expect(bedarf[0]?.source).toBe('gnd')
    expect(bedarf[0]?.values.sort()).toEqual(['günther wolf', 'heinz sielmann'])
  })

  it('reicht Treffer in runRow hinein: der Name bleibt der Wert, die ID wird angehaengt', async () => {
    const mapping = regieProfil()
    // collectAuthorityLookups liefert die Werte in Vergleichsform, also klein.
    const fetchJson = stubFetch((url) =>
      url.toLowerCase().includes('sielmann')
        ? gndAntwort([{ id: '118614355', name: 'Sielmann, Heinz', beruf: 'Tierfilmer' }])
        : gndAntwort([
          { id: '111', name: 'Wolf, Günther' },
          { id: '222', name: 'Günther Wolf' }
        ]))

    const geloest = await resolveAuthorities(collectAuthorityLookups(mapping, zeilen), {
      enabled: true, pauseMs: 0, fetchJson, schema: testSchema
    })

    const r = runRow(mapping, zeilen[0] ?? {}, 'x', { schema: testSchema, ...authorityServices(geloest) })
    const beteiligte = (r.canonical.work['has_event'] as Array<Record<string, unknown>>)[0]
    const agenten = ((beteiligte?.['has_activity'] as Array<Record<string, unknown>>)[0]?.['has_agent']) as
      Array<Record<string, unknown>>

    // Anreichern ist keine Umwandlung: der Name bleibt stehen.
    expect(agenten.map((a) => a['has_name'])).toEqual(['Heinz Sielmann', 'Günther Wolf'])
    // Sielmann ist eindeutig und bekommt die ID …
    expect(agenten[0]?.['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '118614355' }])
    // … Wolf ist mehrdeutig und bekommt bewusst keine.
    expect(agenten[1]?.['same_as']).toBeUndefined()
    expect(r.idOrigins.automatisch).toBe(1)
  })

  it('bei einem reinen Kennungs-Ziel ist die gefundene ID der Wert', async () => {
    const m = emptyMapping(['Regie'], '1.2.3')
    m.columns['Regie'] = {
      pre: [step({ op: 'authority', source: 'gnd', kind: 'person' })],
      targets: [{ target: 'work.same_as.gnd', post: [] }]
    }
    const fetchJson = stubFetch({ 'lobid.org': gndAntwort([{ id: '118614355', name: 'Sielmann, Heinz' }]) })
    const geloest = await resolveAuthorities(collectAuthorityLookups(m, [{ Regie: 'Heinz Sielmann' }]), {
      enabled: true, pauseMs: 0, fetchJson, schema: testSchema
    })

    const r = runRow(m, { Regie: 'Heinz Sielmann' }, 'x', { schema: testSchema, ...authorityServices(geloest) })
    expect(r.canonical.work['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '118614355' }])
  })

  it('ohne Anreicherung laeuft dasselbe Profil durch, nur ohne IDs', async () => {
    const mapping = regieProfil()
    const geloest = await resolveAuthorities(collectAuthorityLookups(mapping, zeilen), {})

    const r = runRow(mapping, zeilen[0] ?? {}, 'x', { schema: testSchema, ...authorityServices(geloest) })
    const beteiligte = (r.canonical.work['has_event'] as Array<Record<string, unknown>>)[0]
    const agenten = ((beteiligte?.['has_activity'] as Array<Record<string, unknown>>)[0]?.['has_agent']) as
      Array<Record<string, unknown>>

    expect(agenten.map((a) => a['has_name'])).toEqual(['Heinz Sielmann', 'Günther Wolf'])
    expect(agenten[0]?.['same_as']).toBeUndefined()
    expect(r.errors).toEqual([])
  })
})

describe('Laender und Sprachen laufen ohne Netz mit', () => {
  it('der country-Konverter macht aus "BRD" den Namen und haengt die GND-ID an', () => {
    const m = emptyMapping(['Land'], '1.2.3')
    m.columns['Land'] = {
      pre: [step({ op: 'country', unknown: 'keep' })],
      targets: [{ target: 'work.production.place', post: [] }]
    }
    const r = runRow(m, { Land: 'BRD' }, 'x', { schema: testSchema, ...authorityServices() })

    const ort = ((r.canonical.work['has_event'] as Array<Record<string, unknown>>)[0]?.['located_in']) as
      Array<Record<string, unknown>>
    expect(ort[0]?.['has_name']).toBe('Deutschland')
    expect(ort[0]?.['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '4011882-4' }])
  })

  it('der language-Konverter findet mehr als die Rueckfalltabelle des Kerns', () => {
    const m = emptyMapping(['Sprache'], '1.2.3')
    m.columns['Sprache'] = {
      pre: [step({ op: 'language', unknown: 'error' })],
      targets: [{ target: 'item.language.spoken', post: [] }]
    }
    const r = runRow(m, { Sprache: 'Georgisch' }, 'x', { schema: testSchema, ...authorityServices() })
    expect(r.errors).toEqual([])
    expect(r.cells['Sprache']?.outputs[0]?.value).toBe('geo')
  })
})

describe('eventplace nimmt Normdaten auf', () => {
  // Im PHP-Stand fehlte der Produktionsort in der Liste der Ziele, die eine
  // gefundene ID aufnehmen koennen — der Treffer fiel wortlos unter den Tisch.
  it('das Ziel "Produktionsland / -ort" akzeptiert eine ID', () => {
    const target = getTarget('work.production.place')
    expect(target).toBeDefined()
    expect(target?.writer.kind).toBe('eventplace')
    expect(acceptsAuthority(target!)).toBe(true)
  })

  it('und traegt sie auch wirklich ein', async () => {
    const m = emptyMapping(['Ort'], '1.2.3')
    m.columns['Ort'] = {
      pre: [step({ op: 'authority', source: 'gnd', kind: 'place' })],
      targets: [{ target: 'work.production.place', post: [] }]
    }
    const fetchJson = stubFetch({
      'lobid.org': gndAntwort([{ id: '4005728-8', name: 'Berlin', type: ['PlaceOrGeographicName'] }])
    })
    const geloest = await resolveAuthorities(collectAuthorityLookups(m, [{ Ort: 'Berlin' }]), {
      enabled: true, pauseMs: 0, fetchJson, schema: testSchema
    })

    const r = runRow(m, { Ort: 'Berlin' }, 'x', { schema: testSchema, ...authorityServices(geloest) })
    const ort = ((r.canonical.work['has_event'] as Array<Record<string, unknown>>)[0]?.['located_in']) as
      Array<Record<string, unknown>>
    expect(ort[0]?.['has_name']).toBe('Berlin')
    expect(ort[0]?.['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '4005728-8' }])
  })
})

describe('Herkunft einer gefundenen ID', () => {
  // Gemeldet: Beim Feld "Land" stand weiter eine Normdaten-ID, obwohl der
  // Konverter "Normdaten nachschlagen" aus dem Profil entfernt worden war. Der
  // Grund ist nicht ein Rest im Profil, sondern der country-Konverter selbst:
  // Die GND-Nummer eines Staates steht in der mitgelieferten Laendertabelle.
  // Damit das im Editor unterscheidbar bleibt, traegt der Treffer seine
  // Herkunft mit.
  it('der country-Konverter meldet seinen Treffer als Herkunft "land"', () => {
    const m = emptyMapping(['Land'], '1.2.3')
    m.columns['Land'] = {
      pre: [step({ op: 'country', unknown: 'keep' })],
      targets: [{ target: 'work.production.place', post: [] }]
    }
    const r = runRow(m, { Land: 'DE' }, 'x', { schema: testSchema, ...authorityServices() })

    expect(r.cells['Land']?.outputs[0]?.ids).toEqual([{ id: '4011882-4', note: '', origin: 'land' }])
    // Er zaehlt nicht als Nachschlagevorgang.
    expect(r.idOrigins).toEqual({ bestaetigt: 0, automatisch: 0 })
  })

  it('ohne country-Konverter bleibt der Rohwert stehen und es kommt keine ID mit', () => {
    const m = emptyMapping(['Land'], '1.2.3')
    m.columns['Land'] = { pre: [], targets: [{ target: 'work.production.place', post: [] }] }
    const r = runRow(m, { Land: 'DE' }, 'x', { schema: testSchema, ...authorityServices() })

    expect(r.cells['Land']?.outputs[0]?.value).toBe('DE')
    expect(r.cells['Land']?.outputs[0]?.ids).toBeUndefined()
  })

  it('eine bestaetigte Zuordnung wirkt nur mit dem authority-Konverter', () => {
    const m = emptyMapping(['Land'], '1.2.3')
    // Bestaetigte Zuordnung im Profil, aber kein authority-Schritt in der Kette.
    m.columns['Land'] = {
      pre: [],
      targets: [{ target: 'work.production.place', post: [] }],
      authorities: { DE: { id: '4011882-4', type: 'GNDResource', label: 'Deutschland' } }
    }
    const ohne = runRow(m, { Land: 'DE' }, 'x', { schema: testSchema, ...authorityServices() })
    expect(ohne.cells['Land']?.outputs[0]?.ids).toBeUndefined()

    // Mit dem Konverter schlaegt sie die Automatik und wird als "bestaetigt" gemeldet.
    m.columns['Land'] = {
      ...m.columns['Land'],
      targets: [{ target: 'work.production.place', post: [step({ op: 'authority', source: 'gnd', kind: 'place' })] }]
    }
    const mit = runRow(m, { Land: 'DE' }, 'x', { schema: testSchema, ...authorityServices() })
    expect(mit.cells['Land']?.outputs[0]?.ids?.[0]?.origin).toBe('bestaetigt')
  })
})
