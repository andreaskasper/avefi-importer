/* Builder — Knotenbildung, Zusammenlegen, Normdaten. */

import { describe, expect, it } from 'vitest'
import { acceptsAuthority, AvefiBuilder } from '../../server/lib/mapping/builder.js'
import { getTarget } from '../../server/lib/mapping/targets.js'
import { testSchema } from './fixtures.js'

function t(key: string) {
  const target = getTarget(key)
  if (target === undefined) throw new Error(`Ziel fehlt: ${key}`)
  return target
}

describe('Knotenbildung', () => {
  it('legt Regie und Kamera in dasselbe Produktionsereignis', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('work.activity.directing'), 'A')
    b.write(t('work.activity.cinematography'), 'B')
    const events = b.build('x').work['has_event'] as any[]
    expect(events.length).toBe(1)
    expect(events[0].has_activity.length).toBe(2)
  })

  it('legt zwei Sprachen mit gleichem Code in eine Struktur', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.language.spoken'), 'ger')
    b.write(t('item.language.subtitles'), 'ger')
    const langs = b.build('x').items[0]?.['in_language'] as any[]
    expect(langs.length).toBe(1)
    expect(langs[0].usage).toEqual(['SpokenLanguage', 'Subtitles'])
  })

  it('einwertige Ziele: der erste Wert gewinnt', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('work.title.primary'), 'Erster')
    b.write(t('work.title.primary'), 'Zweiter')
    expect((b.build('x').work['has_primary_title'] as any).has_name).toBe('Erster')
  })

  it('mehrwertige Ziele bleiben ohne Doppelungen', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.note'), 'Hinweis')
    b.write(t('item.note'), 'Hinweis')
    expect(b.build('x').items[0]?.['has_note']).toEqual(['Hinweis'])
  })

  it('erzeugt eine Fassung auch dann, wenn nur Exemplarangaben vorliegen', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.identifier.local'), 'Sig 1')
    const r = b.build('x')
    expect(r.manifestations.length).toBe(1)
    expect(r.items.length).toBe(1)
  })

  it('verwendet eine vorhandene lokale Kennung statt einer erzeugten', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('work.identifier.local'), 'W-42')
    expect((b.build('x').work['has_identifier'] as any[])[0].id).toBe('W-42')
  })

  it('haengt Notizen aus dem Wertelisten-Rueckfall an das Exemplar', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.identifier.local'), 'Sig 1')
    b.addNote('Farbe', 'sepia')
    expect(b.build('x').items[0]?.['has_note']).toEqual(['Farbe: sepia'])
  })

  it('haengt sie an die Fassung, wenn es kein Exemplar gibt', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('manifestation.note'), 'Fassung A')
    b.addNote('Farbe', 'sepia')
    expect(b.build('x').manifestations[0]?.['has_note']).toContain('Farbe: sepia')
  })

  it('rechnet Laengenangaben in eine Zahl um', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.extent.metre'), 2600)
    expect(b.build('x').items[0]?.['has_extent']).toEqual({ has_value: 2600, has_unit: 'Metre' })
  })
})

describe('Normdaten', () => {
  const gnd = { value: 'A', category: 'avefi:GNDResource', id: '118', resource: 'GNDResource' as const }

  it('haengt einen Treffer als same_as an, ohne den Namen zu ersetzen', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('work.activity.directing'), 'A', [gnd])
    const agent = (b.build('x').work['has_event'] as any[])[0].has_activity[0].has_agent[0]
    expect(agent.has_name).toBe('A')
    expect(agent.same_as).toEqual([{ category: 'avefi:GNDResource', id: '118' }])
  })

  it('macht die ID zum Wert, wenn das Ziel eine reine Kennung ist', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('work.same_as.gnd'), 'A', [gnd])
    expect(b.build('x').work['same_as']).toEqual([{ category: 'avefi:GNDResource', id: '118' }])
  })

  it('laesst einen schemawidrigen Resource-Typ weg', () => {
    const b = new AvefiBuilder(testSchema)
    // GeographicName erlaubt laut Testschema nur GND, nicht Wikidata.
    b.write(t('work.production.place'), 'Berlin',
      [{ value: 'Berlin', category: 'avefi:WikidataResource', id: 'Q64', resource: 'WikidataResource' }])
    const place = (b.build('x').work['has_event'] as any[])[0].located_in[0]
    expect(place.same_as).toBeUndefined()
  })

  it('sagt, welche Ziele Normdaten aufnehmen koennen', () => {
    expect(acceptsAuthority(t('work.activity.directing'))).toBe(true)
    expect(acceptsAuthority(t('work.subject.topic'))).toBe(true)
    expect(acceptsAuthority(t('work.title.primary'))).toBe(false)
    expect(acceptsAuthority(t('item.duration'))).toBe(false)
  })
})

describe('Pflichtangaben und Titelanleihe', () => {
  it('setzt die Werkart, wenn nichts gemappt wurde', () => {
    expect(new AvefiBuilder(testSchema).build('x').work['type']).toBe('Monographic')
  })

  it('leiht den Titel der Fassung, wenn das Werk keinen hat', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('manifestation.title.primary'), 'Fassungstitel')
    expect((b.build('x').work['has_primary_title'] as any).type).toBe('SuppliedDevisedTitle')
  })

  it('gibt einen ungueltigen Wert als Beanstandung zurueck, statt ihn zu schreiben', () => {
    const b = new AvefiBuilder(testSchema)
    const errors = b.write(t('item.colour_type'), 'sepia')
    expect(errors.length).toBe(1)
    expect(b.build('x').items.length).toBe(0)
  })
})

describe('Format des Exemplars', () => {
  it('schreibt Traegerklasse und Wert, und legt Klassen nebeneinander', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.format.film'), '35mmFilm')
    b.write(t('item.format.optical'), 'DVD')
    const formats = b.build('x').items[0]?.['has_format'] as any[]
    expect(formats).toEqual([
      { category: 'avefi:Film', type: '35mmFilm' },
      { category: 'avefi:Optical', type: 'DVD' }
    ])
  })

  it('schreibt denselben Wert nicht zweimal', () => {
    const b = new AvefiBuilder(testSchema)
    b.write(t('item.format.film'), '16mmFilm')
    b.write(t('item.format.film'), '16mmFilm')
    expect((b.build('x').items[0]?.['has_format'] as any[]).length).toBe(1)
  })
})
