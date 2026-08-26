/*
 * Kleine Markdown-Uebersetzung fuer die Oberflaechenbeschreibungen.
 *
 * Bewusst ohne Fremdbibliothek und bewusst schlank: gebraucht werden
 * Ueberschriften, Absaetze, Listen (auch verschachtelt), Tabellen,
 * Codebloecke, Fettschrift, Code im Fliesstext und Links. Alles andere bleibt
 * Text.
 *
 * Jeder Textteil wird maskiert, bevor Auszeichnungen eingesetzt werden. Aus der
 * Quelle kann also kein Markup in die Ausgabe gelangen, auch wenn dort einmal
 * spitze Klammern stehen.
 */

export interface MarkdownOptionen {
  /**
   * Schreibt eine Linkadresse um, etwa von einem Dateinamen auf eine
   * Seitenadresse. Was hier nicht behandelt wird, bleibt unveraendert.
   */
  readonly link?: (ziel: string) => string
}

export interface MarkdownDokument {
  /** Text der ersten Ueberschrift der Stufe 1, ohne Auszeichnung. */
  readonly titel: string
  /** Das uebrige Dokument als HTML. Die Stufe-1-Ueberschrift steht nicht darin. */
  readonly html: string
}

/** Nur diese Adressformen werden zu einem Link. Alles andere bleibt Text. */
const ERLAUBTE_ADRESSE = /^(?:https?:\/\/|mailto:|\/|#)/i

const UEBERSCHRIFT = /^(#{1,6})\s+(.*)$/
const LISTENPUNKT = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/
const TRENNLINIE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const ZAUN = /^\s*```/
const TABELLENTRENNER = /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/

function maskiere(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Auszeichnungen ohne Wirkung entfernen — fuer Ueberschriftentexte. */
export function klartext(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

/** Links und Fettschrift in bereits maskiertem Text. */
function auszeichnungen(maskiert: string, optionen: MarkdownOptionen): string {
  const mitLinks = maskiert.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_treffer, text: string, ziel: string) => {
    const adresse = optionen.link !== undefined ? optionen.link(ziel) : ziel
    // Eine Adresse, die keinem der bekannten Muster folgt, wird nicht zum Link.
    // So entsteht aus einem javascript:-Ziel keine anklickbare Falle.
    if (!ERLAUBTE_ADRESSE.test(adresse)) return text
    const extern = /^https?:/i.test(adresse)
    return `<a href="${adresse}"${extern ? ' rel="noopener noreferrer"' : ''}>${text}</a>`
  })
  return mitLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/** Eine Zeile Fliesstext: Code zuerst herausloesen, darin gilt nichts weiter. */
function fliesstext(text: string, optionen: MarkdownOptionen): string {
  const teile = text.split(/`([^`]+)`/g)
  let ergebnis = ''
  for (let i = 0; i < teile.length; i++) {
    const teil = teile[i] ?? ''
    ergebnis += i % 2 === 1 ? `<code>${maskiere(teil)}</code>` : auszeichnungen(maskiere(teil), optionen)
  }
  return ergebnis
}

/**
 * Zeilen eines Absatzes zusammenfuehren.
 *
 * Zwei Leerzeichen am Zeilenende sind ein harter Umbruch. Die Beschreibungen
 * setzen ihn im Kopf jeder Seite ein, damit Adresse, Seitentitel und Sprache
 * untereinander stehen.
 */
function absatz(zeilen: readonly string[], optionen: MarkdownOptionen): string {
  let ergebnis = ''
  for (let i = 0; i < zeilen.length; i++) {
    const roh = zeilen[i] ?? ''
    const letzte = i === zeilen.length - 1
    ergebnis += fliesstext(roh.trim(), optionen)
    if (letzte) continue
    ergebnis += /\s\s$/.test(roh) ? '<br>' : ' '
  }
  return ergebnis
}

/** Eine Tabellenzeile in ihre Zellen zerlegen. */
function zellen(zeile: string): string[] {
  return zeile.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((z) => z.trim())
}

export function markdownNachHtml(quelle: string, optionen: MarkdownOptionen = {}): MarkdownDokument {
  const zeilen = quelle.replace(/\r\n?/g, '\n').split('\n')
  const aus: string[] = []
  /** Die gerade offenen Listen, von aussen nach innen. */
  const listen: Array<{ einzug: number; geordnet: boolean }> = []
  let titel = ''
  let i = 0

  /** Alle Listen schliessen, die tiefer eingerueckt sind als angegeben. */
  function listenSchliessen(bis: number): void {
    for (;;) {
      const oben = listen[listen.length - 1]
      if (oben === undefined || oben.einzug <= bis) return
      aus.push('</li>')
      aus.push(oben.geordnet ? '</ol>' : '</ul>')
      listen.pop()
    }
  }

  function alleListenSchliessen(): void {
    listenSchliessen(-1)
  }

  while (i < zeilen.length) {
    const zeile = zeilen[i] ?? ''

    /* ------------------------------------------------------- Codeblock */
    if (ZAUN.test(zeile)) {
      alleListenSchliessen()
      const inhalt: string[] = []
      i++
      while (i < zeilen.length && !ZAUN.test(zeilen[i] ?? '')) {
        inhalt.push(zeilen[i] ?? '')
        i++
      }
      i++
      aus.push(`<pre><code>${maskiere(inhalt.join('\n'))}</code></pre>`)
      continue
    }

    /* ------------------------------------------------------- Leerzeile */
    if (zeile.trim() === '') {
      // Eine Leerzeile beendet eine Liste nur dann, wenn danach kein weiterer
      // Listenpunkt folgt. Sonst zerfiele eine locker gesetzte Liste in viele.
      let j = i + 1
      while (j < zeilen.length && (zeilen[j] ?? '').trim() === '') j++
      if (!LISTENPUNKT.test(zeilen[j] ?? '')) alleListenSchliessen()
      i++
      continue
    }

    /* ---------------------------------------------------- Ueberschrift */
    const ueberschrift = UEBERSCHRIFT.exec(zeile)
    if (ueberschrift !== null) {
      alleListenSchliessen()
      const stufe = (ueberschrift[1] ?? '').length
      const text = (ueberschrift[2] ?? '').trim()
      // Die erste Stufe-1-Ueberschrift wird zum Titel und nicht ausgegeben:
      // die Seite setzt sie selbst als h1, damit der Rahmen sie einordnen kann.
      if (stufe === 1 && titel === '') {
        titel = klartext(text)
        i++
        continue
      }
      aus.push(`<h${stufe}>${fliesstext(text, optionen)}</h${stufe}>`)
      i++
      continue
    }

    /* ---------------------------------------------------------- Tabelle */
    if (zeile.trim().startsWith('|') && TABELLENTRENNER.test(zeilen[i + 1] ?? '')) {
      alleListenSchliessen()
      const kopf = zellen(zeile)
      i += 2
      const koerper: string[][] = []
      while (i < zeilen.length && (zeilen[i] ?? '').trim().startsWith('|')) {
        koerper.push(zellen(zeilen[i] ?? ''))
        i++
      }
      aus.push('<table><thead><tr>')
      for (const z of kopf) aus.push(`<th scope="col">${fliesstext(z, optionen)}</th>`)
      aus.push('</tr></thead><tbody>')
      for (const reihe of koerper) {
        aus.push('<tr>')
        for (const z of reihe) aus.push(`<td>${fliesstext(z, optionen)}</td>`)
        aus.push('</tr>')
      }
      aus.push('</tbody></table>')
      continue
    }

    /* ------------------------------------------------------ Trennlinie */
    if (TRENNLINIE.test(zeile)) {
      alleListenSchliessen()
      aus.push('<hr>')
      i++
      continue
    }

    /* ----------------------------------------------------- Listenpunkt */
    const punkt = LISTENPUNKT.exec(zeile)
    if (punkt !== null) {
      const einzug = (punkt[1] ?? '').length
      const nummer = punkt[3]
      const geordnet = nummer !== undefined
      listenSchliessen(einzug)
      const oben = listen[listen.length - 1]
      if (oben === undefined || oben.einzug < einzug) {
        aus.push(geordnet ? '<ol>' : '<ul>')
        listen.push({ einzug, geordnet })
      } else if (oben.geordnet !== geordnet) {
        aus.push('</li>')
        aus.push(oben.geordnet ? '</ol>' : '</ul>')
        listen.pop()
        aus.push(geordnet ? '<ol>' : '<ul>')
        listen.push({ einzug, geordnet })
      } else {
        aus.push('</li>')
      }
      // Die Nummer wird ausdruecklich gesetzt, nicht dem Browser ueberlassen.
      // In den Beschreibungen zaehlt sie Tastendruecke ab Seitenanfang und
      // laeuft ueber Verschachtelungen hinweg weiter; selbst gezaehlt stuenden
      // dort andere Zahlen als im Text.
      aus.push(geordnet ? `<li value="${nummer}">` : '<li>')
      aus.push(fliesstext(punkt[4] ?? '', optionen))
      i++
      continue
    }

    /* ---------------------------------------------------------- Absatz */
    alleListenSchliessen()
    const gesammelt: string[] = []
    while (i < zeilen.length) {
      const z = zeilen[i] ?? ''
      if (z.trim() === '' || UEBERSCHRIFT.test(z) || LISTENPUNKT.test(z) || ZAUN.test(z) || TRENNLINIE.test(z)) break
      gesammelt.push(z)
      i++
    }
    aus.push(`<p>${absatz(gesammelt, optionen)}</p>`)
  }

  alleListenSchliessen()
  return { titel, html: aus.join('\n') }
}
