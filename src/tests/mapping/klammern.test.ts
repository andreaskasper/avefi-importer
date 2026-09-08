/*
 * Umschliessende Klammern abschneiden.
 *
 * Andreas' Vorgabe vom 08.09.2026: Die Klammern sind Kennzeichnung in der
 * Quelldatei, nie Bestandteil des Namens. Sie fallen deshalb immer, unabhaengig
 * vom Profil und davon, ob jemand einen Vorschlag angenommen hat.
 */

import { describe, expect, it } from 'vitest'
import { ohneAussenklammern } from '../../server/lib/mapping/builder.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { runRow } from '../../server/lib/mapping/runner.js'
import { testSchema } from './fixtures.js'

describe('Was abgeschnitten wird', () => {
  it.each([
    ['[Betriebsausflug 1962]', 'Betriebsausflug 1962'],
    ['[ohne Titel]', 'ohne Titel'],
    ['  [Aufnahmen Hafen]  ', 'Aufnahmen Hafen'],
    ['[ Innenraum ]', 'Innenraum'],
    ['[[doppelt]]', '[doppelt]']
  ])('%s wird %s', (ein, aus) => {
    expect(ohneAussenklammern(ein)).toBe(aus)
  })
})

describe('Was unangetastet bleibt', () => {
  it.each([
    'Der blaue Engel',
    'Der blaue Engel [Fragment]',
    '[Fragment] Der blaue Engel',
    'M',
    ''
  ])('%s', (wert) => {
    expect(ohneAussenklammern(wert)).toBe(wert)
  })

  it('zerlegt keinen Wert aus mehreren geklammerten Teilen', () => {
    // Faengt mit [ an, hoert mit ] auf — ist aber nicht als Ganzes geklammert.
    // Ein blosses startsWith/endsWith machte daraus "a] und [b".
    expect(ohneAussenklammern('[a] und [b]')).toBe('[a] und [b]')
  })

  it('laesst unpaarige Klammern in Ruhe', () => {
    expect(ohneAussenklammern('[unvollstaendig')).toBe('[unvollstaendig')
    expect(ohneAussenklammern('unvollstaendig]')).toBe('unvollstaendig]')
    expect(ohneAussenklammern('][')).toBe('][')
  })

  it('macht aus leeren Klammern keinen leeren Titel', () => {
    expect(ohneAussenklammern('[]')).toBe('[]')
    expect(ohneAussenklammern('[  ]')).toBe('[  ]')
  })
})

describe('Es gilt auf jedem Weg, nicht nur im Vorschlag', () => {
  const services = { schema: testSchema }

  function mit(ziel: string) {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = { pre: [], targets: [{ target: ziel, post: [] }] }
    return m
  }

  it('auch ohne jede Kette am Haupttitel', () => {
    const r = runRow(mit('work.title.primary'), { Titel: '[Betriebsausflug]' }, 'z', services)
    expect(r.canonical.work['has_primary_title'])
      .toEqual({ has_name: 'Betriebsausflug', type: 'PreferredTitle' })
  })

  it('auch am Archivtitel', () => {
    const r = runRow(mit('work.title.supplied'), { Titel: '[Betriebsausflug]' }, 'z', services)
    expect(r.canonical.work['has_primary_title'])
      .toEqual({ has_name: 'Betriebsausflug', type: 'SuppliedDevisedTitle' })
  })

  it('auch an einem mehrwertigen Titeltyp', () => {
    const r = runRow(mit('work.title.working'), { Titel: '[Arbeitsfassung]' }, 'z', services)
    expect(r.canonical.work['has_alternative_title'])
      .toEqual([{ has_name: 'Arbeitsfassung', type: 'WorkingTitle' }])
  })

  it('auch am geborgten Titel, der ueber zwei Ebenen wandert', () => {
    const r = runRow(mit('item.title.primary'), { Titel: '[Kopie A]' }, 'z', services)
    expect(r.canonical.work['has_primary_title'])
      .toEqual({ has_name: 'Kopie A', type: 'SuppliedDevisedTitle' })
  })

  it('nicht an Feldern ausserhalb der Titel', () => {
    // Eine Anmerkung "[siehe Akte 5]" ist keine Kennzeichnung, sondern Inhalt.
    const r = runRow(mit('item.note'), { Titel: '[siehe Akte 5]' }, 'z', services)
    expect(r.canonical.items[0]?.['has_note']).toEqual(['[siehe Akte 5]'])
  })
})
