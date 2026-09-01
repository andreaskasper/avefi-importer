/*
 * Das Handbuch von der Platte lesen.
 *
 * Unter docs/handbuch liegen die von Hand geschriebenen Kapitel — Installation,
 * Import, Bearbeitung, Zuordnungen. Bis zum 01.09.2026 lagen sie im
 * Wurzelverzeichnis des Repositoriums und waren damit fuer die Anwendung
 * unsichtbar: In den Container gemountet ist nur src/. Wer aus dem Pruefbericht
 * auf eine Erklaerung verweisen will, braucht sie aber ausgeliefert.
 *
 * Bildschirmabzuege gibt es hier nicht; die Kapitel beschreiben Vorgehen, nicht
 * Bildschirme.
 */
import { erzeugeRubrik, KENNUNG, type Kapitel, type KapitelSeite, type Uebersicht } from './rubrik'

export { KENNUNG }
export type { Kapitel, KapitelSeite, Uebersicht }

/** Adresse der Uebersicht in der Oberflaeche. */
export const BASISPFAD = '/dokumentation/handbuch'

const rubrik = erzeugeRubrik({
  ordnername: 'handbuch',
  basispfad: BASISPFAD,
  pfadVariable: 'HANDBUCH_PATH'
})

export const kapitelListe = rubrik.kapitelListe
export const uebersicht = rubrik.uebersicht
export const kapitelSeite = rubrik.kapitelSeite
