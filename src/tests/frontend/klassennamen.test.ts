/*
 * Namensraeume zwischen daisyUI und der Anwendung.
 *
 * Wir uebernehmen daisyUI nur zur Haelfte: Knoepfe und Abzeichen kommen von
 * dort, die uebrigen Bausteine gehoeren uns. Solange beide Seiten Klassen
 * gleich benennen, entscheidet die Kaskade, wer gewinnt — und zwar je
 * Eigenschaft einzeln. Wer nur `background` und `border` neu setzt, erbt alles
 * andere von daisyUI weiter, ohne es zu merken.
 *
 * Genau das ist am 01.09.2026 passiert: `.modal-box` gab es zweimal. Unsere
 * Fassung setzte Breite, Hintergrund und Rahmen — zu `opacity` sagte sie
 * nichts, also galt daisyUIs `opacity: 0`. daisyUI blendet die Box nur dann
 * ein, wenn sie unter einem Element mit `.modal.modal-open` haengt; unsere
 * Dialoge hingen unter `.modal-overlay`. Ergebnis: Die Seite dunkelte ab, der
 * Dialog blieb unsichtbar. Zwei Tester meldeten das unabhaengig voneinander an
 * fuenf Stellen — Loeschen, Neu konvertieren, Zuordnen (zweimal) und das
 * Anlegen eines Nutzers.
 *
 * Der Fehler war nicht zu sehen, weil nichts fehlschlug. Deshalb dieser Test:
 * Anwendungseigene Klassen tragen ein `ui-`, und was in beiden Welten gleich
 * heisst, muss hier ausdruecklich stehen.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const wurzel = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Namen, die daisyUI gehoeren und die wir bewusst nur ergaenzen, nie ersetzen.
 *
 * Wer hier etwas eintraegt, sagt damit zu: Unsere Regel fuegt Eigenschaften
 * hinzu, sie definiert den Baustein nicht neu. Ein eigener Baustein gehoert
 * nicht in diese Liste, sondern bekommt einen eigenen Namen.
 */
const DAISYUI_GEHOEREND = new Set([
  'btn', // wir ergaenzen nur den Zustand "deaktiviert" und eine Breitenregel
  'badge', // wir ergaenzen Abstand, Schriftgroesse und Gewicht
  'disabled' // kommt nur im Verbund `.btn.disabled` vor
])

/** Klassennamen aus einem Stylesheet lesen, ohne Kommentare mitzuzaehlen. */
function klassen(css: string): Set<string> {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const namen = new Set<string>()
  for (const teil of ohneKommentare.split('{')) {
    const selektor = teil.split('}').pop()
    if (!selektor) continue
    for (const treffer of selektor.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) namen.add(treffer[1]!)
  }
  return namen
}

function eigeneKlassen(): Set<string> {
  return klassen(readFileSync(`${wurzel}/app/assets/css/app.css`, 'utf8'))
}

function daisyuiKlassen(): Set<string> {
  const verzeichnis = `${wurzel}/node_modules/daisyui/components`
  const namen = new Set<string>()
  for (const datei of readdirSync(verzeichnis)) {
    if (!datei.endsWith('.css')) continue
    for (const name of klassen(readFileSync(`${verzeichnis}/${datei}`, 'utf8'))) namen.add(name)
  }
  return namen
}

describe('Klassennamen', () => {
  it('kennt beide Seiten', () => {
    // Ohne diese Zusicherung wuerde der Test unten still bestehen, sobald der
    // Pfad zu daisyUI sich aendert und gar nichts mehr eingelesen wird.
    expect(eigeneKlassen().size).toBeGreaterThan(100)
    expect(daisyuiKlassen().size).toBeGreaterThan(100)
  })

  it('benennt keinen eigenen Baustein wie einen von daisyUI', () => {
    const daisyui = daisyuiKlassen()
    const doppelt = [...eigeneKlassen()]
      .filter((name) => daisyui.has(name) && !DAISYUI_GEHOEREND.has(name))
      .sort()

    expect(
      doppelt,
      doppelt.length === 0
        ? ''
        : `Diese Klassen gibt es in app.css und in daisyUI: ${doppelt.join(', ')}. ` +
            'Entweder gehoert der Baustein uns — dann braucht er einen eigenen Namen mit "ui-" davor — ' +
            'oder wir ergaenzen daisyUI nur; dann gehoert der Name nach DAISYUI_GEHOEREND, ' +
            'zusammen mit dem Satz, was genau ergaenzt wird.'
    ).toEqual([])
  })

  it('haelt die Liste der Ausnahmen ehrlich', () => {
    // Eine Ausnahme, die gar nicht mehr kollidiert, ist eine Notluege: Sie
    // behauptet eine Abhaengigkeit, die es nicht gibt, und niemand raeumt sie
    // weg, weil nichts sie meldet.
    const daisyui = daisyuiKlassen()
    const eigene = eigeneKlassen()
    const ueberfluessig = [...DAISYUI_GEHOEREND]
      .filter((name) => !(daisyui.has(name) && eigene.has(name)))
      .sort()

    expect(
      ueberfluessig,
      `Diese Ausnahmen werden nicht mehr gebraucht und gehoeren geloescht: ${ueberfluessig.join(', ')}`
    ).toEqual([])
  })
})
