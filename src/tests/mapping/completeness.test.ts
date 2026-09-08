/* Vollstaendigkeit und Kernfelder. */

import { describe, expect, it } from 'vitest'
import type { AvefiRecord } from '../../server/lib/mapping/builder.js'
import {
  addToCoreTally, completeness, completenessIssues, coreCoverage,
  corePresence, coreScore, coreState, finishCoreTally, newCoreTally
} from '../../server/lib/mapping/completeness.js'

const leer: AvefiRecord = { work: {}, manifestations: [], items: [] }

const voll: AvefiRecord = {
  work: {
    has_primary_title: { has_name: 'Der Film' },
    type: 'Monographic',
    has_subject: [{ has_name: 'Thema' }],
    has_genre: [{ has_name: 'Dokumentation' }],
    has_event: [{
      category: 'avefi:ProductionEvent',
      has_date: '1953',
      located_in: [{ has_name: 'Deutschland' }],
      has_activity: [{ category: 'avefi:DirectingActivity', has_agent: [{ has_name: 'A' }] }]
    }]
  },
  manifestations: [{}],
  items: [{}]
}

describe('Vollstaendigkeit', () => {
  it('rechnet zwischen null und hundert', () => {
    expect(completeness(leer)).toBe(0)
    expect(completeness(voll)).toBe(100)
  })

  it('benennt, was fehlt', () => {
    const issues = completenessIssues(leer)
    expect(issues.some((i) => i.level === 'error' && i.code === 'hint.noPrimaryTitle')).toBe(true)
    // Der deutsche Satz reist als Rueckfallebene mit, die Oberflaeche waehlt
    // ihren eigenen ueber den Code.
    expect(completenessIssues(voll)).toEqual([
      { level: 'ok', code: 'hint.complete', text: 'Grunddaten vollstaendig' }
    ])
  })

  /*
   * Die Ampel folgt seit dem 08.09.2026 der Verbindlichkeit, nicht dem Anteil.
   * Anlass war ein Datensatz aus Paderborn ohne jeden Haupttitel: Er stand auf
   * Gelb, weil sein Prozentwert ueber 50 lag, waehrend direkt daneben
   * "Pflichtangabe fehlt" in Rot stand.
   */
  it('faerbt rot, sobald ein Pflichtfeld fehlt', () => {
    expect(coreState(leer)).toBe('danger')
    // Nur ein Alternativtitel, kein Haupttitel — genau der Paderborner Fall.
    const nurAlternativtitel: AvefiRecord = {
      work: { type: 'Monographic', has_alternative_title: [{ has_name: 'Expo 2000', type: 'AlternativeTitle' }] },
      manifestations: [{}],
      items: [{}]
    }
    expect(coreState(nurAlternativtitel)).toBe('danger')
  })

  it('faerbt gelb, wenn nur empfohlene Felder fehlen', () => {
    const ohneLand: AvefiRecord = {
      work: {
        has_primary_title: { has_name: 'Der Film' },
        type: 'Monographic',
        has_event: [{
          category: 'avefi:ProductionEvent',
          has_date: '1953',
          has_activity: [{ category: 'avefi:DirectingActivity', has_agent: [{ has_name: 'Lang' }] }]
        }]
      },
      manifestations: [{}],
      items: [{}]
    }
    expect(coreState(ohneLand)).toBe('part')
  })

  it('faerbt gruen, wenn alle vier Kernfelder belegt sind', () => {
    expect(coreState(voll)).toBe('full')
  })

  it('laesst rot vor gelb gehen, auch bei vielen belegten Feldern', () => {
    // Ein Datensatz kann viel enthalten und trotzdem kein Werk sein.
    const reichOhneTitel: AvefiRecord = JSON.parse(JSON.stringify(voll))
    delete reichOhneTitel.work['has_primary_title']
    expect(coreState(reichOhneTitel)).toBe('danger')
  })
})

describe('Kernfelder', () => {
  it('erkennt Titel, Regie, Datum und Land', () => {
    expect(corePresence(voll)).toEqual({
      titel: true, regie: true, produktionsdatum: true, produktionsland: true
    })
    expect(corePresence(leer)).toEqual({
      titel: false, regie: false, produktionsdatum: false, produktionsland: false
    })
  })

  it('zaehlt "4 von 4" ueber mehrere Datensaetze', () => {
    const tally = newCoreTally()
    addToCoreTally(tally, voll)
    addToCoreTally(tally, leer)
    const s = finishCoreTally(tally)
    expect(s.records).toBe(2)
    expect(s.allFour).toBe(1)
    expect(s.allFourPercent).toBe(50)
    expect(s.percent.titel).toBe(50)
    expect(s.complete['0']).toBe(1)
  })

  it('liefert die Belegung im Format des Importberichts', () => {
    const tally = newCoreTally()
    addToCoreTally(tally, voll)
    expect(coreCoverage(tally)['regie']).toEqual({ filled: 1, total: 1 })
  })
})

describe('Kernfelder statt Prozentwert', () => {
  it('zaehlt belegte Kernfelder und nennt die fehlenden beim Namen', () => {
    // Stefans Punkt: Vollstaendigkeit nicht pauschal als Prozentwert bewerten.
    // "3 von 4" sagt, dass etwas fehlt; die Liste sagt, was.
    expect(coreScore(voll).filled).toBe(coreScore(voll).total)
    expect(coreScore(voll).missing).toEqual([])

    const leerScore = coreScore(leer)
    expect(leerScore.filled).toBe(0)
    expect(leerScore.missing).toContain('titel')
    expect(leerScore.missing).toContain('produktionsland')
  })

  it('rechnet ueber dieselbe Stelle wie die Belegungsstatistik', () => {
    const presence = corePresence(voll)
    const belegt = Object.values(presence).filter(Boolean).length
    expect(coreScore(voll).filled).toBe(belegt)
  })
})
