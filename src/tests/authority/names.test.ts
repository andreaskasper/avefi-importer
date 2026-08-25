/*
 * Namensformen — der Kern des Fehlers aus dem PHP-Stand.
 *
 * Die GND fuehrt Personen als "Sielmann, Heinz", die Archivliste als
 * "Heinz Sielmann". Ohne die umgedrehte Form trifft kein Vergleich.
 */

import { describe, expect, it } from 'vitest'
import {
  comparableForms, compareForm, foldUmlauts, invertName, nameMatches, toInvertedForm
} from '../../server/lib/authority/names.js'

describe('invertName', () => {
  it('dreht "Nachname, Vorname" um', () => {
    expect(invertName('Sielmann, Heinz')).toBe('Heinz Sielmann')
  })

  it('schneidet den Zusatz hinter dem zweiten Komma ab (VIAF haengt Lebensdaten an)', () => {
    expect(invertName('Sielmann, Heinz, 1917-2006')).toBe('Heinz Sielmann')
  })

  it('laesst einen Namen ohne Komma in Ruhe', () => {
    expect(invertName('Bundesarchiv')).toBeNull()
  })

  it('liefert nichts bei leerer Haelfte', () => {
    expect(invertName('Sielmann,')).toBeNull()
    expect(invertName(', Heinz')).toBeNull()
  })
})

describe('comparableForms', () => {
  it('liefert beide Formen eines invertierten Namens', () => {
    expect(comparableForms('Sielmann, Heinz')).toEqual(['sielmann, heinz', 'heinz sielmann'])
  })

  it('liefert bei natuerlicher Schreibweise nur eine Form', () => {
    expect(comparableForms('Heinz Sielmann')).toEqual(['heinz sielmann'])
  })

  it('zieht Mehrfach-Leerraum zusammen und schreibt klein', () => {
    expect(comparableForms('  Sielmann,   Heinz ')).toEqual(['sielmann, heinz', 'heinz sielmann'])
  })
})

describe('nameMatches', () => {
  const anfrage = compareForm('Heinz Sielmann')

  it('trifft die invertierte Form der GND — genau das ging im PHP-Stand nie', () => {
    expect(nameMatches('Sielmann, Heinz', anfrage)).toBe(true)
  })

  it('trifft die natuerliche Form von Wikidata', () => {
    expect(nameMatches('Heinz Sielmann', anfrage)).toBe(true)
  })

  it('trifft die VIAF-Form mit Lebensdaten', () => {
    expect(nameMatches('Sielmann, Heinz, 1917-2006', anfrage)).toBe(true)
  })

  it('trifft einen anderen Menschen nicht', () => {
    expect(nameMatches('Sielmann, Inge', anfrage)).toBe(false)
    expect(nameMatches('Heinz Sielmann-Stiftung', anfrage)).toBe(false)
  })

  it('trifft Koerperschaften und Orte in natuerlicher Form', () => {
    expect(nameMatches('Bundesarchiv', compareForm('Bundesarchiv'))).toBe(true)
    expect(nameMatches('Berlin', compareForm('berlin'))).toBe(true)
  })
})

describe('toInvertedForm', () => {
  it('macht aus der natuerlichen Anfrage die Katalogform — fuer VIAF AutoSuggest', () => {
    expect(toInvertedForm('Heinz Sielmann')).toBe('Sielmann, Heinz')
    expect(toInvertedForm('Anna Maria Mueller')).toBe('Mueller, Anna Maria')
  })

  it('laesst Einwortnamen und bereits invertierte Namen unangetastet', () => {
    expect(toInvertedForm('Bundesarchiv')).toBeNull()
    expect(toInvertedForm('Sielmann, Heinz')).toBeNull()
  })
})

describe('foldUmlauts', () => {
  it('schreibt Umlaute um, damit "franzoesisch" dieselbe Zeile findet', () => {
    expect(foldUmlauts('Französisch')).toBe('Franzoesisch')
    expect(foldUmlauts('Großbritannien')).toBe('Grossbritannien')
    expect(foldUmlauts('Türkisch')).toBe('Tuerkisch')
  })
})
