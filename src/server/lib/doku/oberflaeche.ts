/*
 * Die Oberflaechenbeschreibungen von der Platte lesen.
 *
 * Unter docs/oberflaeche liegen eine Uebersicht (README.md) und je Seite der
 * Anwendung eine Beschreibung als Markdown, daneben ein gleichnamiger
 * Bildschirmabzug als PNG. Erzeugt werden die Dateien von
 * tests/a11y/oberflaeche.mjs.
 *
 * Die Mechanik steckt in rubrik.ts und wird mit dem Handbuch geteilt; hier
 * steht nur, was diese Rubrik ausmacht.
 */
import { erzeugeRubrik, KENNUNG, type Kapitel, type KapitelSeite, type Uebersicht } from './rubrik'

export { KENNUNG }
export type { Kapitel, KapitelSeite, Uebersicht }

/** Adresse der Uebersicht in der Oberflaeche. */
export const BASISPFAD = '/dokumentation/oberflaeche'

const rubrik = erzeugeRubrik({
  ordnername: 'oberflaeche',
  basispfad: BASISPFAD,
  pfadVariable: 'DOCS_PATH',
  mitBildern: true
})

export const kapitelListe = rubrik.kapitelListe
export const uebersicht = rubrik.uebersicht
export const kapitelSeite = rubrik.kapitelSeite
export const bildpfad = rubrik.bildpfad
