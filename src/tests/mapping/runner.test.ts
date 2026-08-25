/* Runner — Ausfuehrung, statische Pruefung, Werkbildung. */

import { describe, expect, it } from 'vitest'
import type { MappingJson } from '#shared/types/domain'
import {
  addToTally, collectAuthorityLookups, groupingLabel, groupsWorks, hasBlocker,
  mergeRecords, newRunTally, readTarget, runRow, staticCheck
} from '../../server/lib/mapping/runner.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { demoMapping, demoRows, step, testSchema } from './fixtures.js'

const services = { schema: testSchema }

describe('runRow', () => {
  it('baut aus einer Zeile einen kanonischen Datensatz', () => {
    const r = runRow(demoMapping(), demoRows[0]!, 'zeile1', services)
    const work = r.canonical.work as Record<string, any>

    expect(work['has_primary_title']).toEqual({ has_name: 'Die Wilden Kerle', type: 'PreferredTitle' })
    expect(work['type']).toBe('Monographic')

    const event = work['has_event'][0]
    expect(event.category).toBe('avefi:ProductionEvent')
    expect(event.has_date).toBe('2003-05-12')
    expect(event.has_activity[0].category).toBe('avefi:DirectingActivity')
    expect(event.has_activity[0].has_agent.map((a: any) => a.has_name))
      .toEqual(['Joachim Masannek', 'Anna Mueller'])

    expect(r.canonical.items[0]?.['has_duration']).toEqual({ has_value: 'PT01H35M00S' })
    expect(r.canonical.manifestations.length).toBe(1)
    expect(r.errors).toEqual([])
  })

  it('uebergeht ignorierte Spalten vollstaendig', () => {
    const r = runRow(demoMapping(), demoRows[0]!, 'zeile1', services)
    expect(r.cells['Notiz']).toBeUndefined()
  })

  it('verknuepft Exemplar, Fassung und Werk ueber lokale Kennungen', () => {
    const r = runRow(demoMapping(), demoRows[0]!, 'zeile1', services)
    const manifId = (r.canonical.manifestations[0]?.['has_identifier'] as any[])[0].id
    expect((r.canonical.items[0]?.['is_item_of'] as any).id).toBe(manifId)
    const workId = (r.canonical.work['has_identifier'] as any[])[0].id
    expect((r.canonical.manifestations[0]?.['is_manifestation_of'] as any[])[0].id).toBe(workId)
  })

  it('laesst leere Zellen einfach weg', () => {
    const r = runRow(demoMapping(), demoRows[2]!, 'zeile3', services)
    expect(r.canonical.work['has_event']).toBeUndefined()
    expect(r.errors).toEqual([])
  })

  it('setzt Festwerte, ohne die Quelle zu ueberschreiben', () => {
    const m = demoMapping()
    m.defaults = [
      { target: 'work.title.primary', value: 'Ersatztitel' },
      { target: 'item.access_status', value: 'OnSiteAccess' }
    ]
    const r = runRow(m, demoRows[0]!, 'zeile1', services)
    expect((r.canonical.work['has_primary_title'] as any).has_name).toBe('Die Wilden Kerle')
    expect(r.canonical.items[0]?.['has_access_status']).toBe('OnSiteAccess')
  })

  it('leiht dem Werk den Titel des Exemplars, wenn es keinen eigenen hat', () => {
    const m = emptyMapping(['Signatur'], '1.2.3')
    m.columns['Signatur'] = { pre: [], targets: [{ target: 'item.title.primary', post: [] }] }
    const r = runRow(m, { Signatur: 'Kopie A' }, 'x', services)
    expect(r.canonical.work['has_primary_title']).toEqual({ has_name: 'Kopie A', type: 'SuppliedDevisedTitle' })
  })

  it('haengt einen Normdatentreffer als same_as an, ohne den Namen zu ersetzen', () => {
    const m = emptyMapping(['Regie'], '1.2.3')
    m.columns['Regie'] = {
      pre: [step({ op: 'authority', source: 'gnd', kind: 'person' })],
      targets: [{ target: 'work.activity.directing', post: [] }]
    }
    const r = runRow(m, { Regie: 'Joachim Masannek' }, 'x', {
      ...services,
      resolveAuthority: () => ({ id: '123456789', label: 'Masannek, Joachim' })
    })
    const agent = (r.canonical.work['has_event'] as any[])[0].has_activity[0].has_agent[0]
    expect(agent.has_name).toBe('Joachim Masannek')
    expect(agent.same_as).toEqual([{ category: 'avefi:GNDResource', id: '123456789' }])
    expect(r.idOrigins.automatisch).toBe(1)
  })

  it('bei einem reinen Kennungs-Ziel ist die gefundene ID der Wert', () => {
    const m = emptyMapping(['Regie'], '1.2.3')
    m.columns['Regie'] = {
      pre: [step({ op: 'authority', source: 'gnd', kind: 'person' })],
      targets: [{ target: 'work.same_as.gnd', post: [] }]
    }
    const r = runRow(m, { Regie: 'Joachim Masannek' }, 'x', {
      ...services,
      resolveAuthority: () => ({ id: '123456789' })
    })
    expect(r.canonical.work['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '123456789' }])
  })

  it('verzweigt eine Spalte auf mehrere Ziele mit eigener Nachkette', () => {
    const m = emptyMapping(['Angabe'], '1.2.3')
    m.columns['Angabe'] = {
      pre: [{ op: 'trim' }],
      targets: [
        { target: 'work.title.primary', post: [] },
        { target: 'work.production.date', post: [step({ op: 'regex', pattern: '(\\d{4})', capture: 1 })] }
      ]
    }
    const r = runRow(m, { Angabe: 'Der Film 1953' }, 'x', services)
    expect((r.canonical.work['has_primary_title'] as any).has_name).toBe('Der Film 1953')
    expect((r.canonical.work['has_event'] as any[])[0].has_date).toBe('1953')
  })

  it('warnt zur Laufzeit, wenn ein einwertiges Ziel mehrere Werte bekommt', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = {
      pre: [step({ op: 'split', sep: ';' })],
      targets: [{ target: 'work.title.primary', post: [] }]
    }
    const r = runRow(m, { Titel: 'A;B' }, 'x', services, 4)
    expect(r.issues.some((i) => i.code === 'value.truncated' && i.row === 4)).toBe(true)
    expect((r.canonical.work['has_primary_title'] as any).has_name).toBe('A')
  })

  it('warnt bei einem Wert ausserhalb der Werteliste, verwirft ihn aber nur dort', () => {
    const m = emptyMapping(['Farbe'], '1.2.3')
    m.columns['Farbe'] = { pre: [], targets: [{ target: 'item.colour_type', post: [] }] }
    const r = runRow(m, { Farbe: 'sepia' }, 'x', services)
    expect(r.issues.some((i) => i.code === 'value.invalid')).toBe(true)
    expect(r.canonical.items.length).toBe(0)
  })
})

describe('staticCheck', () => {
  it('haelt ein sauberes Profil fuer unbedenklich', () => {
    const checks = staticCheck(demoMapping(), testSchema)
    expect(hasBlocker(checks)).toBe(false)
  })

  it('blockiert eine Liste in einem einwertigen Ziel und schlaegt take vor', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = {
      pre: [step({ op: 'split', sep: ';' })],
      targets: [{ target: 'work.title.primary', post: [] }]
    }
    const checks = staticCheck(m, testSchema)
    const hit = checks.find((c) => c.code === 'chain.list-in-single')
    expect(hit?.severity).toBe('error')
    expect(hit?.fix).toEqual({ op: 'take', index: 1 })
    expect(hasBlocker(checks)).toBe(true)
  })

  it('blockiert ein unbekanntes Ziel', () => {
    const m = emptyMapping(['X'], '1.2.3')
    m.columns['X'] = { pre: [], targets: [{ target: 'gibts.nicht', post: [] }] }
    expect(hasBlocker(staticCheck(m, testSchema))).toBe(true)
  })

  it('schlaegt den duration-Konverter vor, blockiert aber nicht', () => {
    const m = emptyMapping(['Laufzeit'], '1.2.3')
    m.columns['Laufzeit'] = { pre: [], targets: [{ target: 'item.duration', post: [] }] }
    const checks = staticCheck(m, testSchema)
    const hit = checks.find((c) => c.code === 'chain.duration')
    expect(hit?.severity).toBe('warning')
    expect(hit?.fix).toMatchObject({ op: 'duration' })
    expect(hasBlocker(checks)).toBe(false)
  })

  it('warnt bei einer leeren Werteliste an einem Enum-Ziel', () => {
    const m = emptyMapping(['Farbe'], '1.2.3')
    m.columns['Farbe'] = {
      pre: [],
      targets: [{ target: 'item.colour_type', post: [step({ op: 'map', map: { sw: '' } })] }]
    }
    expect(staticCheck(m, testSchema).some((c) => c.code === 'enum.empty-valuemap')).toBe(true)
  })

  it('warnt, wenn Normdaten an einem Ziel wirkungslos blieben', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = {
      pre: [step({ op: 'authority', source: 'gnd', kind: 'person' })],
      targets: [{ target: 'work.title.primary', post: [] }]
    }
    expect(staticCheck(m, testSchema).some((c) => c.code === 'authority.unsupported')).toBe(true)
  })

  it('warnt, wenn kein Haupttitel gemappt ist', () => {
    const m = emptyMapping(['Signatur'], '1.2.3')
    m.columns['Signatur'] = { pre: [], targets: [{ target: 'item.identifier.local', post: [] }] }
    expect(staticCheck(m, testSchema).some((c) => c.code === 'work.no-title')).toBe(true)
  })
})

describe('Werkbildung', () => {
  function grouped(): MappingJson {
    const m = demoMapping()
    m.grouping.work.by = ['target:work.title.primary']
    return m
  }

  it('ist im Standard ausgeschaltet', () => {
    expect(groupsWorks(demoMapping())).toBe(false)
    expect(groupingLabel(demoMapping())).toMatch(/keine Zusammenfassung/)
  })

  it('fasst Zeilen mit gleichem Zielwert zusammen', async () => {
    const { workKey } = await import('../../server/lib/mapping/runner.js')
    const m = grouped()
    const a = runRow(m, demoRows[0]!, 'z1', services)
    const b = runRow(m, demoRows[1]!, 'z2', services)
    // "  Die Wilden Kerle " und "Die Wilden Kerle" fallen erst nach dem Mapping zusammen.
    expect(workKey(m, demoRows[0]!, a.canonical)).toBe(workKey(m, demoRows[1]!, b.canonical))
  })

  it('liefert keinen Schluessel, wenn alle Bestandteile leer sind', async () => {
    const { workKey } = await import('../../server/lib/mapping/runner.js')
    const m = grouped()
    const c = runRow(m, { Titel: '', Regie: '', Jahr: '', Laufzeit: '', Notiz: '' }, 'z', services)
    expect(workKey(m, { Titel: '' }, c.canonical)).toBeNull()
  })

  it('nennt die Regel im Klartext', () => {
    const m = grouped()
    m.grouping.work.by = ['target:work.title.primary', 'column:Jahr']
    expect(groupingLabel(m)).toBe('Haupttitel + Spalte "Jahr"')
  })

  it('fuehrt zwei Datensaetze zusammen, ohne Werkangaben zu ueberschreiben', () => {
    const m = demoMapping()
    const a = runRow(m, demoRows[0]!, 'z1', services)
    const b = runRow(m, demoRows[1]!, 'z2', services)
    const merged = mergeRecords(a.canonical, b.canonical)
    expect((merged.work['has_primary_title'] as any).has_name).toBe('Die Wilden Kerle')
    expect(merged.manifestations.length).toBe(2)
    expect(merged.items.length).toBe(2)
    const workId = (merged.work['has_identifier'] as any[])[0].id
    expect((merged.manifestations[1]?.['is_manifestation_of'] as any[])[0].id).toBe(workId)
  })
})

describe('readTarget', () => {
  it('liest die gemappten Werte wieder aus', () => {
    const r = runRow(demoMapping(), demoRows[0]!, 'z1', services)
    expect(readTarget(r.canonical, 'work.title.primary')).toBe('Die Wilden Kerle')
    expect(readTarget(r.canonical, 'work.production.date')).toBe('2003-05-12')
    expect(readTarget(r.canonical, 'work.activity.directing')).toBe('Joachim Masannek')
    expect(readTarget(r.canonical, 'item.duration')).toBe('PT01H35M00S')
    expect(readTarget(r.canonical, 'gibts.nicht')).toBe('')
  })
})

describe('Sammelbericht und Normdatenbedarf', () => {
  it('zaehlt Beanstandungen je Spalte mit Beispielen', () => {
    const m = emptyMapping(['Jahr'], '1.2.3')
    m.columns['Jahr'] = { pre: [], targets: [{ target: 'work.production.date', post: [{ op: 'date' }] }] }
    const tally = newRunTally()
    addToTally(tally, runRow(m, { Jahr: 'irgendwann' }, 'a', services))
    addToTally(tally, runRow(m, { Jahr: 'irgendwann' }, 'b', services))
    expect(tally.rows).toBe(2)
    expect(tally.columnIssues['Jahr']?.errors).toBe(2)
    expect(tally.columnIssues['Jahr']?.samples.length).toBe(1)
  })

  it('sammelt ein, was nachgeschlagen werden muss — ohne selbst nachzuschlagen', () => {
    const m = emptyMapping(['Regie'], '1.2.3')
    m.columns['Regie'] = {
      pre: [{ op: 'trim' }, step({ op: 'split', sep: ';' }), step({ op: 'authority', source: 'gnd', kind: 'person' })],
      targets: [{ target: 'work.activity.directing', post: [] }],
      authorities: { 'anna mueller': { id: '999', type: 'GNDResource' } }
    }
    const req = collectAuthorityLookups(m, [{ Regie: ' Joachim Masannek; Anna Mueller ' }])
    expect(req.length).toBe(1)
    expect(req[0]?.source).toBe('gnd')
    expect(req[0]?.values).toEqual(['joachim masannek'])
  })
})
