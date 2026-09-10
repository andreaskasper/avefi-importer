/* Runner — Ausfuehrung, statische Pruefung, Werkbildung. */

import { describe, expect, it } from 'vitest'
import type { AvefiRecord } from '../../server/lib/mapping/builder.js'
import type { MappingJson } from '#shared/types/domain'
import {
  addToTally, authorityInventory, collectAuthorityLookups, groupingLabel, groupsWorks, hasBlocker, hasStartBlocker,
  mergeRecords, newRunTally, readTarget, runRow, staticCheck
} from '../../server/lib/mapping/runner.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { lookupCountry } from '../../server/lib/authority/countries.js'
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

  it('verknuepft Exemplar, Manifestation und Werk ueber lokale Kennungen', () => {
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
    expect(r.issues.some((i) => i.code === 'target.valueNotAllowed')).toBe(true)
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
    // Mit Titel, weil dieser Test den Konverter prueft und nicht die
    // Titelregel: Ohne Titel auf irgendeiner Ebene blockiert seit dem
    // 10.09.2026 `title.nowhere`, und der Test wuerde am falschen Grund
    // scheitern.
    const m = emptyMapping(['Laufzeit', 'Titel'], '1.2.3')
    m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
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

  /*
   * Der Titel, drei Faelle.
   *
   * Bis zum 10.09.2026 gab es nur zwei Zustaende: am Werk gemappt, oder eine
   * Warnung mit dem Hinweis, ersatzweise werde der Titel der Manifestation oder
   * des Exemplars uebernommen. Fehlte der Titel ueberall, war die Warnung eine
   * Luege — es gab nichts zu uebernehmen, und das Ergebnis war ein Datensatz
   * ohne jeden Titel, den das AVefi-Schema anstandslos durchlaesst.
   * Gefunden von Luca Wollny.
   */
  it('sagt nichts, wenn der Haupttitel am Werk haengt', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    const checks = staticCheck(m, testSchema)
    expect(checks.some((c) => c.code === 'work.no-title')).toBe(false)
    expect(checks.some((c) => c.code === 'title.nowhere')).toBe(false)
  })

  it('nimmt auch den Archivtitel als Haupttitel des Werks', () => {
    // work.title.supplied traegt in targets.ts primary: true und fuellt
    // has_primary_title genauso. Vorher zaehlte nur work.title.primary, und der
    // Archivtitel loeste falschen Alarm aus.
    const m = emptyMapping(['Archivtitel'], '1.2.3')
    m.columns['Archivtitel'] = { pre: [], targets: [{ target: 'work.title.supplied', post: [] }] }
    const checks = staticCheck(m, testSchema)
    expect(checks.some((c) => c.code === 'work.no-title')).toBe(false)
    expect(checks.some((c) => c.code === 'title.nowhere')).toBe(false)
  })

  it('warnt, wenn der Titel nur an Manifestation oder Exemplar haengt', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = { pre: [], targets: [{ target: 'item.title.primary', post: [] }] }
    const checks = staticCheck(m, testSchema)
    expect(checks.find((c) => c.code === 'work.no-title')?.severity).toBe('warning')
    expect(hasBlocker(checks)).toBe(false)
  })

  it('verhindert das Konvertieren, wenn auf keiner Ebene ein Titel gemappt ist', () => {
    const m = emptyMapping(['Signatur'], '1.2.3')
    m.columns['Signatur'] = { pre: [], targets: [{ target: 'item.identifier.local', post: [] }] }
    const checks = staticCheck(m, testSchema)
    expect(checks.find((c) => c.code === 'title.nowhere')?.severity).toBe('error')
    expect(hasStartBlocker(checks)).toBe(true)
    // Speichern bleibt erlaubt: Wer eine Zuordnung von oben nach unten aufbaut,
    // hat irgendwann die Kennung und noch keinen Titel. Diesen Zwischenstand
    // nicht parken zu duerfen waere eine Strafe fuer die Reihenfolge der Arbeit.
    expect(hasBlocker(checks)).toBe(false)
    // Und nicht beides: Die Warnung waere hier gegenstandslos.
    expect(checks.some((c) => c.code === 'work.no-title')).toBe(false)
  })

  it('nimmt einen Festwert als Titel an', () => {
    const m = emptyMapping(['Signatur'], '1.2.3')
    m.columns['Signatur'] = { pre: [], targets: [{ target: 'item.identifier.local', post: [] }] }
    m.defaults = [{ target: 'work.title.primary', value: 'Ohne Titel' }]
    expect(staticCheck(m, testSchema).some((c) => c.code === 'title.nowhere')).toBe(false)
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
    const { record: merged } = mergeRecords(a.canonical, b.canonical)
    expect((merged.work['has_primary_title'] as any).has_name).toBe('Die Wilden Kerle')
    expect(merged.manifestations.length).toBe(2)
    expect(merged.items.length).toBe(2)
    const workId = (merged.work['has_identifier'] as any[])[0].id
    expect((merged.manifestations[1]?.['is_manifestation_of'] as any[])[0].id).toBe(workId)
  })

  /*
   * Was beim Zusammenfassen verdraengt wird, verschwand bis zum 08.09.2026
   * kommentarlos. Welcher Wert "der erste" ist, haengt an der Zeilenreihenfolge
   * in der Datei — fuer den Bearbeiter also an nichts Erkennbarem (#16).
   */
  const werk = (titel: string, extra: Record<string, unknown> = {}): AvefiRecord => ({
    work: { has_primary_title: { has_name: titel, type: 'PreferredTitle' }, type: 'Monographic', ...extra },
    manifestations: [],
    items: []
  })

  it('meldet einen verdraengten Titel und behaelt den ersten', () => {
    const { record, conflicts } = mergeRecords(werk('Der blaue Engel'), werk('Der blaue Engel (1930)'))
    expect(conflicts).toEqual([
      { feld: 'has_primary_title', behalten: 'Der blaue Engel', verworfen: 'Der blaue Engel (1930)' }
    ])
    expect((record.work['has_primary_title'] as any).has_name).toBe('Der blaue Engel')
  })

  it('schweigt, wenn beide Zeilen dasselbe sagen', () => {
    expect(mergeRecords(werk('M'), werk('M')).conflicts).toEqual([])
  })

  it('schweigt, wenn die zweite Zeile das Feld gar nicht belegt', () => {
    const ohneTitel: AvefiRecord = { work: { type: 'Monographic' }, manifestations: [], items: [] }
    expect(mergeRecords(werk('M'), ohneTitel).conflicts).toEqual([])
  })

  it('meldet auch die Werkart', () => {
    const a = werk('M')
    const b = werk('M')
    b.work['type'] = 'Serial'
    expect(mergeRecords(a, b).conflicts).toEqual([
      { feld: 'type', behalten: 'Monographic', verworfen: 'Serial' }
    ])
  })

  it('meldet Listen nicht — dort wird vereinigt, nichts geht verloren', () => {
    // Zwei Zeilen mit verschiedenen Regisseurinnen ergeben ein Werk mit beiden.
    // Genau dafuer fasst man zusammen.
    const a = werk('M', { has_note: ['aus Zeile 1'] })
    const b = werk('M', { has_note: ['aus Zeile 2'] })
    const { record, conflicts } = mergeRecords(a, b)
    expect(conflicts).toEqual([])
    expect(record.work['has_note']).toEqual(['aus Zeile 1', 'aus Zeile 2'])
  })

  it('meldet jeden widerspruechlichen Wert einzeln', () => {
    const a = werk('M', { variant_type: 'Original' })
    const b = werk('Metropolis', { variant_type: 'Restauriert' })
    const felder = mergeRecords(a, b).conflicts.map((c) => c.feld)
    expect(felder).toEqual(['has_primary_title', 'variant_type'])
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

  it('meldet den Bedarf JEDER Normdatenquelle eines Zweigs, nicht nur der ersten', () => {
    // Lucas Befund vom 31.08.: Zwei Normdatenkonverter im selben Zweig, und im
    // Export steht nur die Kennung des ersten. Ursache war nicht der Export —
    // fuer die zweite Quelle wurde nie ein Bedarf gemeldet, also nie gesucht.
    const m = emptyMapping(['Regie'], '1.2.3')
    m.columns['Regie'] = {
      pre: [
        step({ op: 'authority', source: 'gnd', kind: 'person' }),
        step({ op: 'authority', source: 'viaf', kind: 'person' })
      ],
      targets: [{ target: 'work.activity.directing', post: [] }]
    }
    const req = collectAuthorityLookups(m, [{ Regie: 'Joachim Masannek' }])
    expect(req.map((r) => r.source).sort()).toEqual(['gnd', 'viaf'])
  })

  it('haelt eine bestaetigte Zuordnung nur fuer ihre eigene Quelle', () => {
    // Der Eintrag ist GND. Fuer VIAF ist der Wert weiterhin offen — sonst
    // bekaeme der VIAF-Konverter die GND-Kennung zurueck.
    const m = emptyMapping(['Regie'], '1.2.3')
    m.columns['Regie'] = {
      pre: [
        step({ op: 'authority', source: 'gnd', kind: 'person' }),
        step({ op: 'authority', source: 'viaf', kind: 'person' })
      ],
      targets: [{ target: 'work.activity.directing', post: [] }],
      authorities: { 'Joachim Masannek': { id: '123', type: 'GNDResource' } }
    }
    const req = collectAuthorityLookups(m, [{ Regie: 'Joachim Masannek' }])
    expect(req.map((r) => r.source)).toEqual(['viaf'])
  })
})

describe('authorityInventory', () => {
  const inventar = () => {
    const m = emptyMapping(['Land'], '1.2.3')
    m.columns['Land'] = {
      pre: [{ op: 'trim' }],
      targets: [{ target: 'work.production.place', post: [step({ op: 'authority', source: 'gnd', kind: 'place' })] }],
      authorities: { Deutschland: { id: '4011882-4', type: 'GNDResource', label: 'Deutschland' } }
    }
    return m
  }

  it('fuehrt auch seltene Werte, nicht nur die ersten drei', () => {
    // Genau Lucas zweiter Punkt: "USA" braucht eine Entscheidung, stand aber
    // ausserhalb der drei Beispielwerte und war damit unerreichbar.
    const rows = [
      { Land: 'Deutschland' }, { Land: 'Deutschland' }, { Land: 'Frankreich' },
      { Land: 'Italien' }, { Land: 'Spanien' }, { Land: 'USA' }
    ]
    const groups = authorityInventory(inventar(), rows)
    expect(groups.length).toBe(1)
    const werte = groups[0]?.values ?? []
    expect(werte.map((v) => v.value)).toContain('USA')
    expect(werte[0]?.value).toBe('Deutschland')
    expect(werte[0]?.count).toBe(2)
  })

  it('nennt den Stand jeder Zuordnung', () => {
    const groups = authorityInventory(inventar(), [{ Land: 'Deutschland' }, { Land: 'USA' }])
    const werte = groups[0]?.values ?? []
    expect(werte.find((v) => v.value === 'Deutschland')?.state).toBe('bestaetigt')
    expect(werte.find((v) => v.value === 'Deutschland')?.id).toBe('4011882-4')
    expect(werte.find((v) => v.value === 'USA')?.state).toBe('offen')
  })

  it('rechnet die Kette vor dem Nachschlagen — gefragt wird der normalisierte Wert', () => {
    const m = emptyMapping(['Land'], '1.2.3')
    m.columns['Land'] = {
      pre: [step({ op: 'country', unknown: 'keep' })],
      targets: [{ target: 'work.production.place', post: [step({ op: 'authority', source: 'gnd', kind: 'place' })] }]
    }
    const groups = authorityInventory(m, [{ Land: 'DE' }], { lookupCountry }, 50)
    expect(groups[0]?.values.map((v) => v.value)).toEqual(['Deutschland'])
  })
})
