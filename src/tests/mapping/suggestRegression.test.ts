/*
 * Regressionsschutz fuer die Kopfzeilen-Erkennung.
 *
 * Angelegt vor der Erweiterung des Zielkatalogs um die uebrigen Titeltypen.
 * Der Katalog waechst dabei von 41 auf rund 72 Eintraege, davon dreissig neue
 * Titelziele — und jedes neue Ziel ist ein neuer Mitbewerber um dieselben
 * Kopfzeilen. Ohne diese Datei faellt eine Verschlechterung erst auf, wenn eine
 * Testperson sie meldet.
 *
 * Festgehalten wird nur, was heute nachweislich richtig ist. Die Faelle, die
 * heute falsch laufen, stehen bewusst nicht hier, sondern als Sollverhalten in
 * suggest.test.ts — sonst wuerde diese Datei einen Fehler zementieren.
 */

import { describe, expect, it } from 'vitest'
import { suggestForColumn } from '../../server/lib/mapping/suggest.js'

function best(header: string): string | undefined {
  return suggestForColumn(header)[0]?.target
}

function targets(header: string): string[] {
  return suggestForColumn(header, 5).map((s) => s.target)
}

describe('Titelspalten, die heute richtig zugeordnet werden', () => {
  it.each([
    'Titel', 'Haupttitel', 'Originaltitel', 'Filmtitel', 'Werktitel', 'Title', 'Titel (2)'
  ])('"%s" bleibt der Haupttitel', (header) => {
    expect(best(header)).toBe('work.title.primary')
    expect(suggestForColumn(header)[0]?.score).toBe(100)
  })

  it.each([
    'Alternativtitel', 'Nebentitel', 'Verleihtitel', 'Zusatztitel', 'Diverse Titel', 'Sonstige Titel'
  ])('"%s" bleibt ein Nebentitel', (header) => {
    expect(best(header)).toBe('work.title.alternative')
  })

  it.each(['Reihentitel', 'Serientitel', 'Reihe', 'Serie'])('"%s" bleibt der Reihentitel', (header) => {
    expect(best(header)).toBe('work.title.series')
  })

  it('"Weiterer Titel" bleibt ein Nebentitel, der Haupttitel bleibt abgewertet', () => {
    const s = suggestForColumn('Weiterer Titel', 5)
    expect(s[0]?.target).toBe('work.title.alternative')
    const primary = s.find((x) => x.target === 'work.title.primary')
    expect(primary?.score).toBeLessThan(50)
  })

  it('"Untertitel" bleibt zwischen Nebentitel und Untertitelsprache mehrdeutig', () => {
    // Beide sind vertretbar; die Erkennung darf keinen der beiden verlieren.
    const t = targets('Untertitel')
    expect(t).toContain('work.title.alternative')
    expect(t).toContain('item.language.subtitles')
  })
})

describe('Spalten ausserhalb der Titel bleiben unberuehrt', () => {
  it.each([
    ['Regie', 'work.activity.directing'],
    ['Produktionsjahr', 'work.production.date'],
    ['Produktionsland', 'work.production.place'],
    ['Signatur', 'item.identifier.local'],
    ['Laufzeit', 'item.duration'],
    ['Farbe', 'item.colour_type'],
    ['Sprache', 'item.language.spoken'],
    ['Drehbuch', 'work.activity.writing'],
    ['Kamera', 'work.activity.cinematography'],
    ['Schnitt', 'work.activity.editing'],
    ['Genre', 'work.genre'],
    ['Schlagwort', 'work.subject.topic']
  ])('"%s" bleibt %s', (header, target) => {
    expect(best(header)).toBe(target)
  })
})

describe('Die Fehler der alten Heuristik bleiben behoben', () => {
  it.each([
    ['Administration', 'item.duration'],
    ['Termin', 'item.duration'],
    ['Design', 'item.identifier.local'],
    ['Deutschland', 'work.production.place']
  ])('"%s" wird nicht zu %s', (header, verboten) => {
    expect(best(header)).not.toBe(verboten)
  })
})
