/*
 * Die Dokumentationsendpunkte.
 *
 * Ein Service je Fachbereich. Er traegt zweierlei: die Adressen und die Form
 * der Antworten. Beides stand bis zum 07.09.2026 in den Seiten selbst — die
 * Uebersicht des Handbuchs und die der Oberflaechenbeschreibungen
 * deklarierten sogar dasselbe Interface zweimal, Wort fuer Woert gleich.
 *
 * Warum Adressen und Typen und nicht fertige Lader: `useFetch` muss im Setup
 * der Seite stehen, damit Nuxt es beim Serverlauf mitbekommt und nicht
 * doppelt holt. In einen Helfer verpackt, leitet Nuxt seinen Schluessel von
 * der Stelle im Helfer ab statt von der Seite — zwei Seiten teilen sich dann
 * einen Zwischenspeicher. Deshalb ruft die Seite `useFetch` weiterhin selbst,
 * bekommt aber Adresse und Typ von hier. Kein Pfad und keine Antwortform
 * steht mehr in einer Seite.
 */

export interface DokuKapitelRef {
  kennung: string
  titel: string
}

export interface DokuUebersicht {
  titel: string
  html: string
  kapitel: DokuKapitelRef[]
}

export interface DokuKapitel {
  kennung: string
  titel: string
  html: string
  vorher: DokuKapitelRef | null
  nachher: DokuKapitelRef | null
  /** Nur bei Oberflaechenbeschreibungen: ob ein Abzug vorliegt. */
  bild?: boolean
}

export function dokuPfade(): {
  handbuch: () => string
  handbuchKapitel: (kennung: string) => string
  oberflaeche: () => string
  oberflaecheSeite: (kennung: string) => string
  oberflaecheBild: (kennung: string) => string
} {
  const api = useApi()
  return {
    handbuch: () => api('/doku/handbuch'),
    handbuchKapitel: (kennung) => api(`/doku/handbuch/${kennung}`),
    oberflaeche: () => api('/doku/oberflaeche'),
    oberflaecheSeite: (kennung) => api(`/doku/oberflaeche/${kennung}`),
    oberflaecheBild: (kennung) => api(`/doku/oberflaeche/bild/${kennung}`)
  }
}
