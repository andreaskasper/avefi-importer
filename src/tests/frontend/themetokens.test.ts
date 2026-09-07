/*
 * Jede benutzte Themenfarbe muss es auch geben.
 *
 * `var(--card)` stand an zwei Stellen und war nirgends definiert: einmal als
 * Hintergrund der aufgeklappten Hauptnavigation im schmalen Fenster, einmal
 * als Hintergrund der klebenden Gruppenueberschrift in der Zielauswahl. Ein
 * undefiniertes Token faellt nicht auf: Der Browser meldet nichts, die
 * Eigenschaft bleibt schlicht ungesetzt. Sichtbar wird es erst dort, wo etwas
 * darunter durchscheint — bei einem Ausklappmenue ueber dem Inhalt und bei
 * einer klebenden Zeile, durch die die Liste wandert. Beides sind Stellen,
 * an denen man selten steht.
 *
 * Gefunden hat es Stefan Stretz in der Frontend-Abnahme am 07.09.2026, von
 * Hand. Das ist der eigentliche Grund fuer diesen Test: Ein Abgleich, den
 * jemand von Hand macht, findet den Fehler einmal.
 *
 * Kommentare werden vorher entfernt. Ohne das meldet der Test `--btn-fg`,
 * das nur in einem Kommentar vorkommt, der daisyUIs eigene Regel erklaert —
 * ein Fehlalarm, der den Test unglaubwuerdig machen wuerde.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const wurzel = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Tokens, die daisyUI zur Laufzeit stellt und die wir deshalb nicht selbst
 * definieren. Wer hier etwas eintraegt, sagt zu: Das Token kommt verlaesslich
 * aus dem Theme, nicht aus unserem Stylesheet.
 */
const VON_DAISYUI = new Set<string>([])

function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
}

/** Alle .css- und .vue-Dateien unter app/. */
function dateien(verzeichnis: string, gesammelt: string[] = []): string[] {
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name)
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt)
    else if (pfad.endsWith('.css') || pfad.endsWith('.vue')) gesammelt.push(pfad)
  }
  return gesammelt
}

describe('Themenfarben', () => {
  it('jedes var(--token) hat eine Definition', () => {
    const definiert = new Set(VON_DAISYUI)
    const benutzt = new Map<string, string[]>()

    for (const pfad of dateien(join(wurzel, 'app'))) {
      const text = ohneKommentare(readFileSync(pfad, 'utf8'))
      for (const treffer of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) definiert.add(treffer[1]!)
      for (const treffer of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        const kurz = pfad.slice(wurzel.length)
        const liste = benutzt.get(treffer[1]!) ?? []
        if (!liste.includes(kurz)) liste.push(kurz)
        benutzt.set(treffer[1]!, liste)
      }
    }

    const fehlend = [...benutzt.entries()]
      .filter(([token]) => !definiert.has(token))
      .map(([token, orte]) => `${token} (${orte.join(', ')})`)

    expect(fehlend).toEqual([])
  })
})
