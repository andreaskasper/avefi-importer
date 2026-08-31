/* Vorschau — gezielte Beispielsuche, Belegung, Datenhinweise. */

import { describe, expect, it } from 'vitest'
import { buildPreview, buildProfileSample, pickExamples, previewChain } from '../../server/lib/mapping/preview.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { runRow } from '../../server/lib/mapping/runner.js'
import { lookupCountry } from '../../server/lib/authority/countries.js'
import { demoMapping, demoRows, step, testSchema } from './fixtures.js'

const rows = [
  { Jahr: '', Land: 'DE' },
  { Jahr: '', Land: 'DE' },
  { Jahr: '1953', Land: 'DE / FR' },
  { Jahr: '1953', Land: 'AT / DE' },
  { Jahr: '1960', Land: '' },
  { Jahr: '1971', Land: 'CH / DE' }
]

describe('Beispiele werden gesucht, nicht abgezaehlt', () => {
  it('findet die ersten verschiedenen gefuellten Werte, nicht die ersten Zeilen', () => {
    const picked = pickExamples(['Jahr'], rows)
    expect(picked['Jahr']?.examples.map((e) => e.raw)).toEqual(['1953', '1960', '1971'])
    expect(picked['Jahr']?.examples[0]?.row).toBe(2)
  })

  it('zaehlt die Haeufigkeit weiter, auch nach genug Beispielen', () => {
    expect(pickExamples(['Jahr'], rows)['Jahr']?.examples[0]?.count).toBe(2)
  })

  it('liefert die Belegung je Spalte gleich mit', () => {
    const picked = pickExamples(['Jahr', 'Land'], rows)
    expect(picked['Jahr']?.filled).toBe(4)
    expect(picked['Land']?.filled).toBe(5)
  })
})

describe('Stichprobe fuers Profil', () => {
  it('haelt Werte mit Haeufigkeit und Belegung fest', () => {
    const sample = buildProfileSample(['Jahr'], rows, { totalRows: 77 })
    expect(sample.values?.['Jahr']?.[0]).toEqual({ value: '1953', count: 2 })
    expect(sample.coverage?.['Jahr']).toEqual({ filled: 4, total: 77 })
    expect(sample.rows.length).toBe(6)
  })
})

describe('Vorschau', () => {
  it('rechnet nur die noetigen Zeilen und liefert einen ganzen Datensatz', () => {
    const p = buildPreview({ columns: ['Titel', 'Regie', 'Jahr', 'Laufzeit', 'Notiz'], rows: demoRows, rowCount: 77 },
      demoMapping(), { schema: testSchema })
    expect(p.evaluatedRows).toBeLessThanOrEqual(demoRows.length)
    expect(p.canonical).not.toBeNull()
    expect(p.columns['Titel']?.filled).toEqual({ n: 3, of: 3, total: 77 })
    expect(p.columns['Titel']?.examples[0]?.outputs[0]?.target).toBe('work.title.primary')
    expect(p.coverage['Regie']).toEqual({ filled: 2, total: 3 })
  })

  it('deckelt die Zahl gerechneter Zeilen', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ Titel: `T${i}` }))
    const m = emptyMapping(['Titel'])
    m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    const p = buildPreview({ columns: ['Titel'], rows: many }, m, {
      schema: testSchema, maxRows: 5, perColumn: 20
    })
    expect(p.evaluatedRows).toBe(5)
  })

  it('sieht am Trennzeichen, dass eine Spalte aufgeteilt gehoert', () => {
    const m = emptyMapping(['Land'])
    m.columns['Land'] = { pre: [], targets: [{ target: 'work.production.place', post: [] }] }
    const p = buildPreview({ columns: ['Land'], rows }, m, { schema: testSchema })
    const hit = p.checks.find((c) => c.code === 'data.separator')
    expect(hit?.fix).toEqual({ op: 'split', sep: '/' })
  })

  it('schweigt, wenn schon aufgeteilt wird', () => {
    const m = emptyMapping(['Land'])
    m.columns['Land'] = {
      pre: [step({ op: 'split', sep: '/' })],
      targets: [{ target: 'work.production.place', post: [] }]
    }
    const p = buildPreview({ columns: ['Land'], rows }, m, { schema: testSchema })
    expect(p.checks.some((c) => c.code === 'data.separator')).toBe(false)
  })

  it('nimmt eine hereingereichte Schemapruefung auf', () => {
    const p = buildPreview({ columns: ['Titel'], rows: [{ Titel: 'A' }] }, demoMapping(), {
      schema: testSchema,
      validateRecord: () => ['WorkVariant: has_form fehlt']
    })
    expect(p.schema[0]).toEqual({ message: 'WorkVariant: has_form fehlt', rows: 1 })
  })
})

describe('Kette einzeln vorrechnen', () => {
  it('zeigt Ergebnis, Liste und Beanstandungen', () => {
    const r = previewChain([step({ op: 'split', sep: ';' }), { op: 'uppercase' }], 'a;b')
    expect(r.list).toEqual(['A', 'B'])
    expect(r.value).toBe('A; B')
    expect(r.errors).toEqual([])
  })
})

describe('Herkunft eines Werts', () => {
  it('nennt die Zwischenstufe nach der gemeinsamen Kette', () => {
    // Stefans Praezisierung: Bei transformierten Werten soll sichtbar sein, wie
    // aus dem Originalwert der AVefi-Wert wurde.
    const m = emptyMapping(['Land'], '1.2.3')
    m.columns['Land'] = {
      pre: [step({ op: 'country', unknown: 'keep' })],
      targets: [{ target: 'work.production.place', post: [] }]
    }
    const ergebnis = runRow(m, { Land: 'DE' }, 'r1', { schema: testSchema, lookupCountry })
    expect(ergebnis.cells['Land']?.raw).toBe('DE')
    expect(ergebnis.cells['Land']?.pre).toBe('Deutschland')
  })
})
