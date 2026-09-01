/*
 * Eine Doku-Rubrik: ein Ordner mit Markdown-Kapiteln, als HTML ausgeliefert.
 *
 * Zwei Rubriken teilen sich diese Mechanik — die maschinell erzeugten
 * Oberflaechenbeschreibungen und das von Hand geschriebene Handbuch. Sie
 * unterscheiden sich nur im Ordner, in der Adresse und darin, ob es zu einem
 * Kapitel einen Bildschirmabzug gibt.
 *
 * Uebersetzt wird hier, auf dem Server. Der Browser bekommt fertiges HTML mit
 * echten Ueberschriften, Listen und Tabellen — Markdown im Rohtext waere fuer
 * ein Vorlesewerkzeug eine Aneinanderreihung von Rauten und Sternchen.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { markdownNachHtml, type MarkdownDokument } from './markdown'

/** Nur diese Form gilt als Kennung eines Kapitels; alles andere wird abgewiesen. */
export const KENNUNG = /^[0-9]{2}-[a-z0-9-]+$/

export interface Kapitel {
  readonly kennung: string
  readonly titel: string
}

export interface Uebersicht {
  readonly titel: string
  readonly html: string
  readonly kapitel: readonly Kapitel[]
}

export interface KapitelSeite extends Kapitel {
  readonly html: string
  readonly vorher: Kapitel | null
  readonly nachher: Kapitel | null
  /** Ob zu diesem Kapitel ein Bildschirmabzug vorliegt. */
  readonly bild: boolean
}

export interface Rubrik {
  readonly basispfad: string
  kapitelListe(): Promise<Kapitel[]>
  uebersicht(): Promise<Uebersicht>
  kapitelSeite(kennung: string): Promise<KapitelSeite | null>
  bildpfad(kennung: string): Promise<string | null>
}

export interface RubrikOptionen {
  /** Ordnername unter docs/, etwa "oberflaeche" oder "handbuch". */
  readonly ordnername: string
  /** Adresse der Uebersicht in der Oberflaeche. */
  readonly basispfad: string
  /** Umgebungsvariable, die den Ordner ueberschreibt. */
  readonly pfadVariable?: string
  /** Ob neben den Kapiteln Bildschirmabzuege liegen koennen. */
  readonly mitBildern?: boolean
}

export function erzeugeRubrik(optionen: RubrikOptionen): Rubrik {
  const { ordnername, basispfad, pfadVariable, mitBildern = false } = optionen

  /** Verweise zwischen den Dateien auf die Adressen der Oberflaeche umschreiben. */
  function adresse(ziel: string): string {
    // Ein Anker am Dateinamen muss erhalten bleiben: Verweise innerhalb des
    // Handbuchs zeigen auf Abschnitte, nicht nur auf Kapitel.
    const [datei = '', anker] = ziel.split('#', 2)
    const zusatz = anker === undefined ? '' : `#${anker}`
    const kapitel = /^([0-9]{2}-[a-z0-9-]+)\.md$/.exec(datei)
    if (kapitel !== null) return `${basispfad}/${kapitel[1] ?? ''}${zusatz}`
    if (/^readme\.md$/i.test(datei)) return `${basispfad}${zusatz}`
    return ziel
  }

  let verzeichnis: string | null = null

  /**
   * Das Verzeichnis der Kapitel finden.
   *
   * Im Entwicklungsbetrieb liegt es unter dem Arbeitsverzeichnis, in einem
   * gebauten Stand kann es daneben liegen. Die Umgebungsvariable hat Vorrang,
   * damit sich der Ort ohne Codeaenderung setzen laesst.
   */
  async function ordner(): Promise<string> {
    if (verzeichnis !== null) return verzeichnis
    const kandidaten = [
      pfadVariable === undefined ? '' : process.env[pfadVariable] ?? '',
      resolve(process.cwd(), 'docs', ordnername),
      resolve(process.cwd(), '..', 'docs', ordnername)
    ].filter((pfad) => pfad !== '')
    for (const pfad of kandidaten) {
      const info = await stat(pfad).catch(() => null)
      if (info !== null && info.isDirectory()) {
        verzeichnis = pfad
        return pfad
      }
    }
    throw new Error(`Verzeichnis der Rubrik "${ordnername}" nicht gefunden.`)
  }

  interface Zwischenstand {
    readonly zeit: number
    readonly dokument: MarkdownDokument
  }

  /**
   * Bereits uebersetzte Dateien, nach Aenderungszeit gepruefte Ablage.
   *
   * Jede Anfrage neu zu uebersetzen waere verschwendet, und der Stand auf der
   * Platte aendert sich nur, wenn die Kapitel neu geschrieben werden.
   */
  const abgelegt = new Map<string, Zwischenstand>()

  async function dokument(datei: string): Promise<MarkdownDokument> {
    const pfad = join(await ordner(), datei)
    const info = await stat(pfad)
    const alt = abgelegt.get(datei)
    if (alt !== undefined && alt.zeit === info.mtimeMs) return alt.dokument
    const roh = await readFile(pfad, 'utf8')
    const uebersetzt = markdownNachHtml(roh, { link: adresse })
    abgelegt.set(datei, { zeit: info.mtimeMs, dokument: uebersetzt })
    return uebersetzt
  }

  async function kapitelListe(): Promise<Kapitel[]> {
    const dateien = (await readdir(await ordner()))
      .filter((name) => name.endsWith('.md') && KENNUNG.test(name.slice(0, -3)))
      .sort()
    const liste: Kapitel[] = []
    for (const datei of dateien) {
      const uebersetzt = await dokument(datei)
      liste.push({ kennung: datei.slice(0, -3), titel: uebersetzt.titel })
    }
    return liste
  }

  async function bildpfad(kennung: string): Promise<string | null> {
    if (!mitBildern || !KENNUNG.test(kennung)) return null
    const pfad = join(await ordner(), `${kennung}.png`)
    const info = await stat(pfad).catch(() => null)
    return info !== null && info.isFile() ? pfad : null
  }

  return {
    basispfad,
    kapitelListe,
    async uebersicht(): Promise<Uebersicht> {
      const [uebersetzt, kapitel] = await Promise.all([dokument('README.md'), kapitelListe()])
      return { titel: uebersetzt.titel, html: uebersetzt.html, kapitel }
    },
    async kapitelSeite(kennung: string): Promise<KapitelSeite | null> {
      if (!KENNUNG.test(kennung)) return null
      const liste = await kapitelListe()
      const stelle = liste.findIndex((k) => k.kennung === kennung)
      if (stelle < 0) return null
      const uebersetzt = await dokument(`${kennung}.md`)
      return {
        kennung,
        titel: uebersetzt.titel,
        html: uebersetzt.html,
        vorher: liste[stelle - 1] ?? null,
        nachher: liste[stelle + 1] ?? null,
        bild: (await bildpfad(kennung)) !== null
      }
    },
    bildpfad
  }
}
