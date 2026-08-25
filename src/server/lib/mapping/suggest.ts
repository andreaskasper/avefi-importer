/*
 * MappingSuggest — Vorschlaege, welches Ziel zu einer Quellspalte passt.
 *
 * Nachfolger der Heuristik aus RecordMapper::classify, mit zwei Korrekturen:
 *
 *  1. Verglichen wird auf Wortebene statt auf Teilstrings. Die alte Fassung
 *     prueft mit "enthaelt", wodurch "min" in "Administration" und "Termin"
 *     traf, "sign" in "Design" und "land" in "Landkreis".
 *  2. Es gewinnt nicht der erste Treffer, sondern der beste: jeder Vorschlag
 *     traegt einen Konfidenzwert, und die Oberflaeche zeigt die Alternativen.
 *
 * Vorschlaege werden nie automatisch uebernommen — sie sind vorausgefuellte
 * Auswahl, die ein Mensch bestaetigt.
 */

export interface TargetSuggestion {
  target: string
  /** Konfidenz zwischen 0 und 100. */
  score: number
}

/** Ziel -> Schluesselwoerter, bereits in der Vergleichsform (Umlaute aufgeloest). */
const KEYWORDS: Record<string, readonly string[]> = {
  'work.title.primary': ['titel', 'haupttitel', 'originaltitel', 'filmtitel', 'title', 'werktitel'],
  'work.title.alternative': ['alternativtitel', 'nebentitel', 'untertitel', 'verleihtitel', 'subtitle',
    'alttitel', 'diverse', 'weitere', 'sonstige', 'zusatztitel', 'arbeitstitel'],
  'work.title.series': ['reihe', 'reihentitel', 'serie', 'serientitel', 'series'],
  'work.production.date': ['jahr', 'year', 'produktionsjahr', 'entstehungsjahr', 'entstehung',
    'produktionsdatum', 'datierung', 'herstellungsjahr', 'erscheinungsjahr'],
  'work.production.place': ['land', 'produktionsland', 'herstellungsland', 'country', 'produktionsort', 'drehort'],
  'work.activity.directing': ['regie', 'regisseur', 'regisseurin', 'director', 'regiefuehrung'],
  'work.activity.writing': ['drehbuch', 'buch', 'autor', 'autorin', 'screenplay', 'writer', 'skript'],
  'work.activity.cinematography': ['kamera', 'kameramann', 'kamerafrau', 'bildgestaltung', 'camera', 'cinematography'],
  'work.activity.editing': ['schnitt', 'montage', 'editor', 'editing'],
  'work.activity.music': ['musik', 'komponist', 'komponistin', 'music', 'composer'],
  'work.activity.sound': ['ton', 'tongestaltung', 'sound'],
  'work.activity.producing': ['produzent', 'produzentin', 'producer', 'produktionsleitung'],
  'work.activity.company': ['produktionsfirma', 'produktion', 'herstellungsfirma', 'firma', 'studio',
    'produktionsgesellschaft'],
  'work.activity.cast': ['darsteller', 'darstellerin', 'besetzung', 'mitwirkende', 'cast', 'rolle'],
  'work.genre': ['genre', 'gattung'],
  'work.form': ['form', 'werkart', 'filmart', 'art', 'kategorie', 'filmgattung'],
  'work.subject.topic': ['schlagwort', 'schlagworte', 'stichwort', 'thema', 'sachbegriff', 'keywords',
    'verschlagwortung'],
  'work.subject.person': ['personen', 'beteiligte personen'],
  'work.subject.place': ['ort', 'orte', 'geografikum', 'schauplatz'],
  'work.identifier.local': ['werkid', 'werknummer', 'filmid', 'filmnummer'],
  'work.same_as.gnd': ['gnd', 'gndid', 'gndnummer'],
  'work.same_as.wikidata': ['wikidata', 'qid'],
  'work.same_as.filmportal': ['filmportal'],

  'manifestation.publication.date': ['urauffuehrung', 'premiere', 'veroeffentlichung', 'erstauffuehrung', 'release'],
  'manifestation.note': ['fassung', 'fassungsanmerkung'],
  'manifestation.webresource': ['link', 'url', 'weblink', 'permalink', 'onlineressource'],

  'item.identifier.local': ['signatur', 'sign', 'inventarnummer', 'inventar', 'objektnummer',
    'archivnummer', 'kennung', 'barcode', 'nummer', 'id'],
  'item.element_type': ['element', 'elementart', 'materialart', 'kopienart', 'kopietyp', 'traeger',
    'traegermaterial', 'material'],
  'item.colour_type': ['farbe', 'farbigkeit', 'colour', 'color', 'sw'],
  'item.sound_type': ['tonart', 'tonformat', 'tontechnik', 'tonsystem', 'stumm', 'lichtton'],
  'item.frame_rate': ['bildfrequenz', 'framerate', 'bilder'],
  'item.access_status': ['zugang', 'zugangsstatus', 'status', 'benutzung'],
  'item.duration': ['laufzeit', 'dauer', 'laenge', 'spieldauer', 'duration', 'minuten', 'spielzeit'],
  'item.extent.metre': ['meter', 'laengem', 'filmlaenge', 'konfektionierung'],
  'item.extent.feet': ['fuss', 'feet', 'ft'],
  'item.language.spoken': ['sprache', 'sprachfassung', 'language', 'originalsprache'],
  'item.language.subtitles': ['untertitelsprache', 'untertitel', 'subtitles'],
  'item.language.intertitles': ['zwischentitel', 'intertitles'],
  'item.note': ['bemerkung', 'bemerkungen', 'anmerkung', 'notiz', 'kommentar', 'beschreibung',
    'inhalt', 'zustand', 'standort', 'lagerort', 'regal', 'synchronisiert', 'akte', 'rollen',
    'bildformat', 'ausgeliehen'],
  'item.webresource': ['digitalisat', 'digitalisatlink']
}

/** Woerter, die einen Titel als Nebenform kennzeichnen. */
const TITLE_QUALIFIERS: readonly string[] = ['diverse', 'weitere', 'sonstige', 'neben', 'alternativ',
  'alternative', 'verleih', 'zusatz', 'unter', 'arbeits', 'serien', 'reihen', 'original']

/**
 * Bewertet ein Wort gegen ein Schluesselwort.
 *   100 = gleich
 *    70 = das Wort beginnt mit dem Schluesselwort ("Signatur" zu "sign")
 *    50 = das Schluesselwort beginnt mit dem Wort
 * Treffer mitten im Wort zaehlen nicht — genau daher kam "Design" zu "Signatur".
 */
export function scoreToken(token: string, keyword: string): number {
  if (token === keyword) return 100
  if (keyword.length < 4 || token.length < 4) return 0
  if (token.startsWith(keyword)) return 70
  if (keyword.startsWith(token)) return 50
  return 0
}

/** Kopfzeile in Vergleichswoerter zerlegen (Umlaute aufgeloest, Zaehlzusatz weg). */
export function tokens(header: string): string[] {
  let h = header.trim().toLowerCase()
  h = h.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  h = h.replace(/\(\d+\)\s*$/, '') // "Titel (2)" ist immer noch ein Titel
  const parts = h.split(/[^a-z0-9]+/).filter((p) => p !== '')
  // Zusammengeschrieben mitpruefen: "Entst Jahr" auch als "entstjahr".
  if (parts.length > 1) parts.push(parts.join(''))
  return parts
}

function hasQualifier(parts: readonly string[]): boolean {
  for (const t of parts) {
    if (t === 'titel' || t === 'title') continue
    for (const q of TITLE_QUALIFIERS) {
      if (t === q || t.startsWith(q)) return q !== 'original' // Originaltitel bleibt Haupttitel
    }
  }
  return false
}

/** Vorschlaege fuer eine Spalte, bester zuerst. */
export function suggestForColumn(header: string, limit = 3): TargetSuggestion[] {
  const parts = tokens(header)
  if (parts.length === 0) return []

  const scores = new Map<string, number>()
  for (const [target, words] of Object.entries(KEYWORDS)) {
    let best = 0
    for (const w of words) {
      for (const t of parts) {
        const s = scoreToken(t, w)
        if (s > best) best = s
      }
    }
    if (best > 0) scores.set(target, best)
  }
  if (scores.size === 0) return []

  // "Diverse Titel" und "Untertitel" sind keine Haupttitel. Ohne diese Regel
  // gewinnt der Haupttitel ueberall, wo das Wort "Titel" vorkommt.
  if (scores.has('work.title.primary') && hasQualifier(parts)) {
    scores.set('work.title.primary', 40)
    scores.set('work.title.alternative', Math.max(scores.get('work.title.alternative') ?? 0, 90))
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([target, score]) => ({ target, score }))
}

/** Vorschlaege fuer alle Spalten. Spalten ohne Treffer fehlen im Ergebnis. */
export function suggestForColumns(columns: readonly string[], limit = 3): Record<string, TargetSuggestion[]> {
  const out: Record<string, TargetSuggestion[]> = {}
  for (const c of columns) {
    const s = suggestForColumn(c, limit)
    if (s.length > 0) out[c] = s
  }
  return out
}

/**
 * Spalten mit wenigen verschiedenen Werten sind Vokabularkandidaten: das
 * Ergebnis fuellt eine Werteliste vor, statt sie von Hand tippen zu lassen.
 * @param distinct Spalte -> Wert -> Haeufigkeit
 */
export function vocabularyCandidates(
  distinct: Record<string, Record<string, number>>,
  maxDistinct = 12
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [col, values] of Object.entries(distinct)) {
    const entries = Object.entries(values)
    if (entries.length === 0 || entries.length > maxDistinct) continue
    out[col] = entries.sort((a, b) => b[1] - a[1]).map(([v]) => v)
  }
  return out
}
