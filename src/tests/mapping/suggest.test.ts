/* Vorschlaege — Wortbestandteile statt Teilstrings, Konfidenz statt erstem Treffer. */

import { describe, expect, it } from 'vitest'
import { scoreToken, suggestForColumn, suggestForColumns, tokens, vocabularyCandidates } from '../../server/lib/mapping/suggest.js'

function best(header: string): string | undefined {
  return suggestForColumn(header)[0]?.target
}

describe('Die Fehler der alten Heuristik bleiben behoben', () => {
  it('"Administration" und "Termin" sind keine Minuten', () => {
    expect(best('Administration')).not.toBe('item.duration')
    expect(best('Termin')).not.toBe('item.duration')
  })

  it('"Design" ist keine Signatur', () => {
    expect(best('Design')).not.toBe('item.identifier.local')
  })

  it('"Deutschland" traegt kein Land mitten im Wort', () => {
    // Die alte Fassung traf hier ueber "enthaelt"; ein Treffer am Wortende zaehlt nicht mehr.
    expect(best('Deutschland')).not.toBe('work.production.place')
  })

  it('"Landkreis" ist bestenfalls ein schwacher Vorschlag', () => {
    // Wortanfang zaehlt weiterhin, aber nur mit halber Konfidenz — eine Spalte
    // "Produktionsland" schlaegt sie damit ueberall.
    const s = suggestForColumn('Landkreis')
    expect(s[0]?.score).toBeLessThan(100)
    expect(suggestForColumn('Produktionsland')[0]?.score).toBe(100)
  })
})

describe('Treffer', () => {
  it('erkennt die ueblichen Spalten', () => {
    expect(best('Titel')).toBe('work.title.primary')
    expect(best('Regie')).toBe('work.activity.directing')
    expect(best('Produktionsjahr')).toBe('work.production.date')
    expect(best('Produktionsland')).toBe('work.production.place')
    expect(best('Signatur')).toBe('item.identifier.local')
    expect(best('Laufzeit')).toBe('item.duration')
  })

  it('haelt Nebenformen des Titels auseinander', () => {
    expect(best('Untertitel')).toBe('work.title.alternative')
    expect(best('Diverse Titel')).toBe('work.title.alternative')
    expect(best('Originaltitel')).toBe('work.title.primary')
  })

  it('liefert Alternativen mit Konfidenz, nicht nur einen Treffer', () => {
    const s = suggestForColumn('Titel')
    expect(s[0]?.score).toBe(100)
    expect(s.length).toBeGreaterThan(0)
    expect(s.every((x, i) => i === 0 || x.score <= (s[i - 1]?.score ?? 0))).toBe(true)
  })

  it('schweigt, wenn nichts passt', () => {
    expect(suggestForColumn('Xyzzy')).toEqual([])
    expect(suggestForColumns(['Xyzzy'])).toEqual({})
  })
})

describe('Zerlegung und Bewertung', () => {
  it('loest Umlaute auf und wirft den Zaehlzusatz weg', () => {
    expect(tokens('Länge (2)')).toEqual(['laenge'])
  })

  it('prueft zusammengeschriebene Formen mit', () => {
    expect(tokens('Entst Jahr')).toContain('entstjahr')
  })

  it('bewertet gleich, beginnend und kurz', () => {
    expect(scoreToken('titel', 'titel')).toBe(100)
    expect(scoreToken('signatur', 'sign')).toBe(70)
    expect(scoreToken('sign', 'signatur')).toBe(50)
    expect(scoreToken('design', 'sign')).toBe(0)
    expect(scoreToken('abc', 'abc')).toBe(100)
  })
})

describe('Vokabularkandidaten', () => {
  it('nennt Spalten mit wenigen verschiedenen Werten, haeufigste zuerst', () => {
    const r = vocabularyCandidates({ Farbe: { sw: 10, farbig: 4 }, Titel: Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`t${i}`, 1])
    ) })
    expect(r['Farbe']).toEqual(['sw', 'farbig'])
    expect(r['Titel']).toBeUndefined()
  })
})
