/*
 * Lesbare Beschriftungen fuer Schemawerte.
 *
 * Das AVefi-Schema fuehrt seine Vokabulare in Binnenmajuskel: "BlackAndWhite",
 * "TitleProper", "Monographic". Als Bedienoberflaeche gelesen sind das keine
 * Woerter, sondern Kennungen — Stefans Punkt 6. Uebersetzt werden sie ueber
 * i18n unter mapping.vocab.<Vokabular>.<Wert>; was dort (noch) fehlt, faellt
 * auf eine Trennung der Binnenmajuskel zurueck. Der technische Wert bleibt
 * sichtbar, aber als Zusatz, nicht als Beschriftung.
 */

/**
 * "BlackAndWhite" wird zu "Black and White", "16mmFilm" zu "16mm Film".
 *
 * Bewusst ein Rueckfall und keine Uebersetzung: Er macht einen unbekannten
 * Wert lesbar, ohne zu behaupten, er sei uebersetzt.
 */
export function splitCamel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Aus "enum:ColourTypeEnum" wird "ColourTypeEnum". */
export function enumNameOf(type: string | undefined): string {
  return typeof type === 'string' && type.startsWith('enum:') ? type.slice(5) : ''
}
