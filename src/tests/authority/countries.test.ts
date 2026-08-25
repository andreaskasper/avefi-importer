/* Laendertabelle: viele Schreibweisen, ein Name und eine GND-ID. */

import { describe, expect, it } from 'vitest'
import {
  allCountries, countryKey, countryTableSize, lookupCountry
} from '../../server/lib/authority/countries.js'

describe('Laender nachschlagen', () => {
  it('fuehrt Kuerzel, Codes und Namen auf denselben Eintrag', () => {
    for (const schreibweise of ['DE', 'DEU', 'D', 'BRD', 'Deutschland', 'deutschland', ' de ', 'GER']) {
      const treffer = lookupCountry(schreibweise)
      expect(treffer, schreibweise).not.toBeNull()
      expect(treffer?.name, schreibweise).toBe('Deutschland')
      expect(treffer?.gnd, schreibweise).toBe('4011882-4')
    }
  })

  it('kennt untergegangene Staaten', () => {
    expect(lookupCountry('DDR')?.name).toBe('Deutsche Demokratische Republik')
    expect(lookupCountry('CSSR')?.name).toBe('Tschechoslowakei')
    expect(lookupCountry('UdSSR')?.name).toBe('Sowjetunion')
    expect(lookupCountry('DE bis 1945')?.name).toBe('Deutsches Reich')
    expect(lookupCountry('Jugoslawien')?.name).toBe('Jugoslawien')
  })

  it('markiert untergegangene Staaten als solche', () => {
    expect(lookupCountry('DDR')?.historic).toBe(true)
    expect(lookupCountry('Frankreich')?.historic).toBe(false)
  })

  it('nimmt Punkte und Mehrfach-Leerraum hin', () => {
    expect(lookupCountry('U.S.A.')?.name).toBe(lookupCountry('USA')?.name)
    expect(lookupCountry('DE   BIS   1945')?.name).toBe('Deutsches Reich')
  })

  it('findet Namen auch ohne Umlaute', () => {
    expect(lookupCountry('Grossbritannien')?.code).toBe('GBR')
    expect(lookupCountry('Großbritannien')?.code).toBe('GBR')
    expect(lookupCountry('Oesterreich')?.code).toBe('AUT')
  })

  it('liefert null bei Unbekanntem — was damit geschieht, entscheidet der Konverter', () => {
    expect(lookupCountry('Mittelerde')).toBeNull()
    expect(lookupCountry('')).toBeNull()
    expect(lookupCountry('   ')).toBeNull()
  })

  it('jeder Eintrag hat einen Namen, und fast jeder eine GND-ID', () => {
    const ohneName = allCountries().filter((e) => e.name.trim() === '')
    expect(ohneName).toEqual([])
    const ohneGnd = allCountries().filter((e) => e.gnd === '')
    expect(ohneGnd.length).toBeLessThan(allCountries().length / 10)
  })

  it('die Tabelle ist vollstaendig genug fuer ISO 3166-1', () => {
    expect(countryTableSize()).toBeGreaterThan(240)
  })
})

describe('countryKey', () => {
  it('vereinheitlicht Gross- und Kleinschreibung, Punkte und Leerraum', () => {
    expect(countryKey(' u.s.a. ')).toBe('USA')
    expect(countryKey('de   bis 1945')).toBe('DE BIS 1945')
  })
})
