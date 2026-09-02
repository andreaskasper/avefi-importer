/*
 * Wortschatz der deutschen Oberflaeche.
 *
 * "Fassung" stand in dieser Anwendung fuer drei verschiedene Sachen: die
 * AVefi-Ebene zwischen Werk und Exemplar, den Stand eines Zuordnungsprofils und
 * ein halbes Dutzend Vokabularwerte ("Gekuerzte Fassung"). Im
 * Zuordnungseditor waren die ersten beiden gleichzeitig auf dem Bildschirm, und
 * die Testrunde hat das gemeldet: "Fassung durch Manifestation ersetzen"
 * (Pad, Abnahmekriterien, 01.09.2026).
 *
 * Aufgeloest ist es jetzt so: Ebene heisst Manifestation, der Stand eines
 * Profils heisst Version, die Vokabularwerte kommen aus dem Message-Katalog des
 * Schemas. Ein Suchen-und-Ersetzen haette daraus "Manifestation 3
 * wiederherstellen" gemacht, deshalb steht die Trennung hier fest.
 *
 * Der zweite Teil des Tests sichert das Gegenteil ab: Innen muss "Fassung"
 * weiterhin erkannt werden. Die Lieferdateien der Archive tragen Spalten mit
 * genau diesem Wort, und wer es beim naechsten Aufraeumen aus der
 * Synonymtabelle streicht, nimmt dem Vorschlagsmechanismus seinen besten
 * Treffer fuer die Manifestationsebene.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { levelInHeader } from '../../server/lib/mapping/suggest.js'

const locales = fileURLToPath(new URL('../../i18n/locales', import.meta.url))

/**
 * Zusammensetzungen, in denen "fassung" nichts mit der AVefi-Ebene und nichts
 * mit dem Stand eines Profils zu tun hat. Wer hier etwas eintraegt, sagt damit:
 * Das Wort meint an dieser Stelle etwas anderes, und ein Leser verwechselt es
 * nicht mit der Manifestation.
 */
const HARMLOS = /Zusammenfassung|Kurzfassung|Neufassung|Verfassung/gi

function blaetter(o: unknown, pfad: string[] = []): Array<[string, string]> {
  if (typeof o === 'string') return [[pfad.join('.'), o]]
  if (o === null || typeof o !== 'object') return []
  return Object.entries(o as Record<string, unknown>)
    .flatMap(([k, v]) => blaetter(v, [...pfad, k]))
}

describe('deutsche Oberflaeche', () => {
  it('sagt nirgends mehr "Fassung"', () => {
    const treffer: string[] = []
    for (const datei of readdirSync(`${locales}/de`)) {
      const inhalt = JSON.parse(readFileSync(`${locales}/de/${datei}`, 'utf8')) as unknown
      for (const [pfad, wert] of blaetter(inhalt)) {
        if (/fassung/i.test(wert.replace(HARMLOS, ''))) treffer.push(`${datei} · ${pfad} · ${wert}`)
      }
    }
    expect(treffer, 'Ebene heisst Manifestation, der Stand eines Profils heisst Version').toEqual([])
  })

  it('hat zu jedem deutschen Schluessel einen englischen', () => {
    for (const datei of readdirSync(`${locales}/de`)) {
      const de = JSON.parse(readFileSync(`${locales}/de/${datei}`, 'utf8')) as unknown
      const en = JSON.parse(readFileSync(`${locales}/en/${datei}`, 'utf8')) as unknown
      const nurDe = blaetter(de).map(([p]) => p)
        .filter((p) => !blaetter(en).some(([q]) => q === p))
      expect(nurDe, `ohne englische Entsprechung in ${datei}`).toEqual([])
    }
  })
})

describe('Quellspalten', () => {
  it('erkennt "Fassung" weiterhin als Manifestationsebene', () => {
    expect(levelInHeader(['fassung'])).toBe('manifestation')
    expect(levelInHeader(['manifestation'])).toBe('manifestation')
  })
})
