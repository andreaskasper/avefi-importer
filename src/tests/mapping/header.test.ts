/* Kopfzeile — Hash-Stabilitaet, Entdopplung, Spaltenabgleich. */

import { describe, expect, it } from 'vitest'
import {
  buildHeader, cleanHeader, dedupeColumns, diffColumns, headerHash,
  isEmptyRow, nameSimilarity, normalizeHeader, rowsFromCells
} from '../../server/lib/mapping/header.js'

describe('Bereinigung', () => {
  it('entfernt BOM, Rand und Mehrfach-Leerraum', () => {
    expect(cleanHeader('﻿  Titel   der   Sache  ')).toBe('Titel der Sache')
  })

  it('normalisiert nur die Schreibweise, nicht die Umlaute', () => {
    expect(normalizeHeader('LÄNGE')).toBe('länge')
    expect(normalizeHeader('Länge')).not.toBe(normalizeHeader('Lange'))
  })
})

describe('Hash', () => {
  const columns = ['Titel', 'Regie', 'Jahr', 'Länge']

  it('bleibt gleich, wenn dieselben Spalten umsortiert kommen', () => {
    const a = headerHash(columns, 'csv')
    const b = headerHash(['Länge', 'Jahr', 'Titel', 'Regie'], 'csv')
    expect(b).toBe(a)
  })

  it('bleibt gleich bei anderer Schreibweise und Randleerraum', () => {
    expect(headerHash(['  titel ', 'REGIE', 'Jahr', 'Länge'], 'csv')).toBe(headerHash(columns, 'csv'))
  })

  it('aendert sich, wenn eine Spalte dazukommt', () => {
    expect(headerHash([...columns, 'Notiz'], 'csv')).not.toBe(headerHash(columns, 'csv'))
  })

  it('aendert sich mit dem Basisformat', () => {
    expect(headerHash(columns, 'tsv')).not.toBe(headerHash(columns, 'csv'))
  })

  it('unterscheidet Umlaut und Grundbuchstabe', () => {
    expect(headerHash(['Länge'], 'csv')).not.toBe(headerHash(['Lange'], 'csv'))
  })

  it('ist ein md5 in Hexschreibweise', () => {
    expect(headerHash(columns, 'csv')).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('Entdopplung', () => {
  it('macht zwei gleiche Spalten unterscheidbar', () => {
    expect(dedupeColumns(['Titel', 'Regie', 'Titel'])).toEqual(['Titel', 'Regie', 'Titel (2)'])
  })

  it('zaehlt weiter, wenn es mehr als zwei sind', () => {
    expect(dedupeColumns(['Titel', 'Titel', 'Titel'])).toEqual(['Titel', 'Titel (2)', 'Titel (3)'])
  })

  it('weicht aus, wenn der Ausweichname schon vergeben ist', () => {
    expect(dedupeColumns(['Titel', 'Titel (2)', 'Titel'])).toEqual(['Titel', 'Titel (2)', 'Titel (3)'])
  })

  it('gibt namenlosen Spalten einen Platzhalter', () => {
    expect(dedupeColumns(['Titel', '', '  '])).toEqual(['Titel', 'Spalte 2', 'Spalte 3'])
  })

  it('unterscheidet nur nach Schreibweise nicht', () => {
    expect(dedupeColumns(['Titel', 'titel'])).toEqual(['Titel', 'titel (2)'])
  })
})

describe('Kopfzeile lesen', () => {
  it('liefert bereinigte, entdoppelte Spalten samt Hash', () => {
    const info = buildHeader(['﻿Titel', 'Titel', ' Jahr '], 'csv')
    expect(info.columns).toEqual(['Titel', 'Titel (2)', 'Jahr'])
    expect(info.rawColumns).toEqual(['Titel', 'Titel', 'Jahr'])
    expect(info.hash).toBe(headerHash(info.columns, 'csv'))
  })

  it('bildet Zeilen und laesst leere weg', () => {
    const rows = rowsFromCells(['A', 'B'], [['1', '2'], ['', '  '], ['3']])
    expect(rows).toEqual([{ A: '1', B: '2' }, { A: '3', B: '' }])
    expect(isEmptyRow({ A: '', B: ' ' })).toBe(true)
  })
})

describe('Spaltenabgleich', () => {
  it('trennt passend, fehlend und zusaetzlich', () => {
    const d = diffColumns(['Titel', 'Regie', 'Jahr'], ['titel', 'Jahr', 'Laufzeit'])
    expect(d.matched).toEqual(['titel', 'Jahr'])
    expect(d.missing).toEqual(['Regie'])
    expect(d.extra).toEqual(['Laufzeit'])
  })

  it('erkennt eine wahrscheinliche Umbenennung', () => {
    const d = diffColumns(['Produktionsjahr'], ['Produktionsjahre'])
    expect(d.renamed[0]).toMatchObject({ from: 'Produktionsjahr', to: 'Produktionsjahre' })
  })

  it('behauptet nichts bei voellig verschiedenen Namen', () => {
    const d = diffColumns(['Regie'], ['Bildfrequenz'])
    expect(d.renamed).toEqual([])
  })

  it('misst Aehnlichkeit zwischen null und eins', () => {
    expect(nameSimilarity('Titel', 'Titel')).toBe(1)
    expect(nameSimilarity('Titel', '')).toBe(0)
    expect(nameSimilarity('Regie', 'Bildfrequenz')).toBeLessThan(0.4)
  })
})
