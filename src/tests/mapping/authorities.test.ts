/*
 * Bestaetigte Normdatenzuordnungen im Profil — je Quelle eine.
 *
 * Der Fehler, den diese Tests festhalten: Frueher lag je Quellwert genau ein
 * Eintrag. Wer erst GND und dann VIAF bestaetigte, ueberschrieb damit die erste
 * Entscheidung, ohne dass etwas darauf hinwies — und im Export stand nur eine
 * Kennung. Genau das hat Luca am 31.08. als "nur eine Normdateizuordnung pro
 * Zweig" gemeldet.
 */
import { describe, expect, it } from 'vitest'
import type { ColumnMapping } from '../../shared/types/domain.js'
import { clearConfirmed, confirmedFor, resourceTypeOfEntry, setConfirmed } from '../../app/utils/authorities.js'

describe('bestaetigte Normdaten', () => {
  it('haelt eine Zuordnung je Quelle nebeneinander', () => {
    const spec: ColumnMapping = {}
    setConfirmed(spec, 'Heinz Sielmann', { id: '118614371', type: 'GNDResource', label: 'Sielmann, Heinz' })
    setConfirmed(spec, 'Heinz Sielmann', { id: '12345', type: 'VIAFResource' })

    expect(confirmedFor(spec, 'Heinz Sielmann', 'gnd')?.id).toBe('118614371')
    expect(confirmedFor(spec, 'Heinz Sielmann', 'viaf')?.id).toBe('12345')
  })

  it('ersetzt nur die Entscheidung derselben Quelle', () => {
    const spec: ColumnMapping = {}
    setConfirmed(spec, 'Berlin', { id: 'a', type: 'GNDResource' })
    setConfirmed(spec, 'Berlin', { id: 'b', type: 'WikidataResource' })
    setConfirmed(spec, 'Berlin', { id: 'c', type: 'GNDResource' })

    expect(confirmedFor(spec, 'Berlin', 'gnd')?.id).toBe('c')
    expect(confirmedFor(spec, 'Berlin', 'wikidata')?.id).toBe('b')
  })

  it('nimmt eine Zuordnung quellgenau zurueck', () => {
    const spec: ColumnMapping = {}
    setConfirmed(spec, 'Berlin', { id: 'a', type: 'GNDResource' })
    setConfirmed(spec, 'Berlin', { id: 'b', type: 'VIAFResource' })
    clearConfirmed(spec, 'Berlin', 'gnd')

    expect(confirmedFor(spec, 'Berlin', 'gnd')).toBeUndefined()
    expect(confirmedFor(spec, 'Berlin', 'viaf')?.id).toBe('b')
  })

  it('liest aeltere Profile weiter: ein Eintrag ohne Quellbezug ist GND', () => {
    const spec: ColumnMapping = { authorities: { Berlin: { id: 'alt', type: '' } } }
    expect(confirmedFor(spec, 'Berlin', 'gnd')?.id).toBe('alt')
    expect(confirmedFor(spec, 'Berlin', 'viaf')).toBeUndefined()
    expect(resourceTypeOfEntry({ id: 'x', type: 'wikidata' })).toBe('WikidataResource')
  })

  it('bleibt bei einer einzigen Zuordnung beim schlanken Format', () => {
    const spec: ColumnMapping = {}
    setConfirmed(spec, 'Berlin', { id: 'a', type: 'GNDResource' })
    expect(Array.isArray(spec.authorities?.Berlin)).toBe(false)
  })
})
