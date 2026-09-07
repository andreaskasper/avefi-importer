/*
 * Der Waechter "Nur wenn".
 *
 * Er ist die einzige Operation, die einen Wert wegwirft, ohne das zu melden.
 * Das ist Absicht und der Grund, warum es ihn gibt: Erst damit lassen sich
 * zwei Ziele so verzweigen, dass je Zeile nur eines etwas bekommt.
 */

import { describe, expect, it } from 'vitest'
import { chainType, runChain } from '../../server/lib/mapping/transform.js'
import type { TransformStep } from '#shared/types/domain'

function lauf(chain: TransformStep[], value: unknown) {
  return runChain(chain, value as never)
}

const KLAMMER = '^\\[(.*)\\]$'

describe('Zweigwahl', () => {
  it('laesst passende Werte durch und schneidet die Gruppe heraus', () => {
    const r = lauf([{ op: 'only', pattern: KLAMMER, capture: 1 }], '[Betriebsausflug]')
    expect(r.value).toBe('Betriebsausflug')
    expect(r.errors).toEqual([])
  })

  it('macht nicht passende Werte leer, ohne zu beanstanden', () => {
    const r = lauf([{ op: 'only', pattern: KLAMMER, capture: 1 }], 'Der blaue Engel')
    expect(r.value).toBe('')
    expect(r.errors).toEqual([])
  })

  it('kehrt mit negate um', () => {
    const chain: TransformStep[] = [{ op: 'only', pattern: '^\\[.*\\]$', negate: true }]
    expect(lauf(chain, 'Der blaue Engel').value).toBe('Der blaue Engel')
    expect(lauf(chain, '[Betriebsausflug]').value).toBe('')
  })

  it('bildet mit zwei Zweigen eine vollstaendige Aufteilung', () => {
    const haupt: TransformStep[] = [{ op: 'only', pattern: '^\\[.*\\]$', negate: true }]
    const archiv: TransformStep[] = [{ op: 'only', pattern: KLAMMER, capture: 1 }]
    for (const wert of ['Der blaue Engel', '[Betriebsausflug]', 'M', '[ohne Titel]']) {
      const a = String(lauf(haupt, wert).value)
      const b = String(lauf(archiv, wert).value)
      // Genau einer der beiden Zweige liefert etwas — nie beide, nie keiner.
      expect([a === '', b === ''].filter(Boolean).length).toBe(1)
    }
  })
})

describe('Randfaelle', () => {
  it('laesst leere Werte leer, auch beim umgekehrten Waechter', () => {
    // Sonst zoege ein negate-Waechter jede leere Zelle in seinen Zweig.
    expect(lauf([{ op: 'only', pattern: KLAMMER, negate: true }], '').value).toBe('')
    expect(lauf([{ op: 'only', pattern: KLAMMER, negate: true }], '   ').value).toBe('   ')
  })

  it('verankert auf den ganzen Wert: ein Zusatz in Klammern zaehlt nicht', () => {
    // "Der blaue Engel [Fragment]" ist ein Haupttitel mit einem Zusatz, kein
    // Archivtitel. Ein unverankertes Muster wuerde ihn umdeuten.
    expect(lauf([{ op: 'only', pattern: KLAMMER, capture: 1 }], 'Der blaue Engel [Fragment]').value).toBe('')
    expect(lauf([{ op: 'only', pattern: '^\\[.*\\]$', negate: true }], 'Der blaue Engel [Fragment]').value)
      .toBe('Der blaue Engel [Fragment]')
  })

  it('arbeitet auf Listen elementweise', () => {
    const r = lauf([{ op: 'only', pattern: KLAMMER, capture: 1 }], ['[a]', 'b', '[c]'])
    expect(r.value).toEqual(['a', 'c'])
  })

  it('beanstandet ein ungueltiges Muster genau einmal je Wert', () => {
    const r = lauf([{ op: 'only', pattern: '[' }], 'egal')
    expect(r.errors.length).toBe(1)
    expect(r.errors[0]?.code).toBe('transform.badRegex')
  })

  it('laesst ohne Muster alles unveraendert', () => {
    expect(lauf([{ op: 'only', pattern: '' }], 'Der blaue Engel').value).toBe('Der blaue Engel')
  })
})

describe('Statische Pruefung', () => {
  it('beanstandet negate zusammen mit capture', () => {
    const r = chainType([{ op: 'only', pattern: KLAMMER, negate: true, capture: 1 }])
    expect(r.errors.map((e) => e.code)).toContain('transform.onlyNegateCapture')
  })

  it('laesst jeden der beiden fuer sich zu', () => {
    expect(chainType([{ op: 'only', pattern: KLAMMER, capture: 1 }]).errors).toEqual([])
    expect(chainType([{ op: 'only', pattern: KLAMMER, negate: true }]).errors).toEqual([])
  })

  it('aendert den Typ der Kette nicht', () => {
    expect(chainType([{ op: 'only', pattern: KLAMMER }], 'text').type).toBe('text')
    expect(chainType([{ op: 'only', pattern: KLAMMER }], 'list').type).toBe('list')
  })
})
