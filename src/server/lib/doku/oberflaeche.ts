/*
 * Die Oberflaechenbeschreibungen von der Platte lesen.
 *
 * Unter docs/oberflaeche liegen eine Uebersicht (README.md) und je Seite der
 * Anwendung eine Beschreibung als Markdown, daneben ein gleichnamiger
 * Bildschirmabzug als PNG. Erzeugt werden die Dateien von
 * tests/a11y/oberflaeche.mjs.
 *
 * Uebersetzt wird hier, auf dem Server. Der Browser bekommt fertiges HTML mit
 * echten Ueberschriften, Listen und Tabellen — Markdown im Rohtext waere fuer
 * ein Vorlesewerkzeug eine Aneinanderreihung von Rauten und Sternchen.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { markdownNachHtml, type MarkdownDokument } from './markdown'

/** Nur diese Form gilt als Kennung eines Kapitels; alles andere wird abgewiesen. */
const KENNUNG = /^[0-9]{2}-[a-z0-9-]+$/

/** Adresse der Uebersicht in der Oberflaeche. */
export const BASISPFAD = '/dokumentation/oberflaeche'

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

/** Verweise zwischen den Dateien auf die Adressen der Oberflaeche umschreiben. */
function adresse(ziel: string): string {
  const kapitel = /^([0-9]{2}-[a-z0-9-]+)\.md$/.exec(ziel)
  if (kapitel !== null) return `${BASISPFAD}/${kapitel[1] ?? ''}`
  if (/^readme\.md$/i.test(ziel)) return BASISPFAD
  return ziel
}

let verzeichnis: string | null = null

/**
 * Das Verzeichnis der Beschreibungen finden.
 *
 * Im Entwicklungsbetrieb liegt es unter dem Arbeitsverzeichnis, in einem
 * gebauten Stand kann es daneben liegen. DOCS_PATH hat Vorrang, damit sich der
 * Ort ohne Codeaenderung setzen laesst.
 */
async function ordner(): Promise<string> {
  if (verzeichnis !== null) return verzeichnis
  const kandidaten = [
    process.env.DOCS_PATH ?? '',
    resolve(process.cwd(), 'docs', 'oberflaeche'),
    resolve(process.cwd(), '..', 'docs', 'oberflaeche')
  ].filter((pfad) => pfad !== '')
  for (const pfad of kandidaten) {
    const info = await stat(pfad).catch(() => null)
    if (info !== null && info.isDirectory()) {
      verzeichnis = pfad
      return pfad
    }
  }
  throw new Error('Verzeichnis der Oberflaechenbeschreibungen nicht gefunden.')
}

interface Zwischenstand {
  readonly zeit: number
  readonly dokument: MarkdownDokument
}

/**
 * Bereits uebersetzte Dateien, nach Aenderungszeit gepruefte Ablage.
 *
 * Zusammen rund 160.000 Zeichen: jede Anfrage neu zu uebersetzen waere
 * verschwendet, und der Stand auf der Platte aendert sich nur, wenn die
 * Beschreibungen neu erzeugt werden.
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

/** Alle Kapitel in der Reihenfolge ihrer Dateinamen. */
export async function kapitelListe(): Promise<Kapitel[]> {
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

export async function uebersicht(): Promise<Uebersicht> {
  const [uebersetzt, kapitel] = await Promise.all([dokument('README.md'), kapitelListe()])
  return { titel: uebersetzt.titel, html: uebersetzt.html, kapitel }
}

export async function kapitelSeite(kennung: string): Promise<KapitelSeite | null> {
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
}

/** Pfad des Bildschirmabzugs, oder null, wenn keiner vorliegt. */
export async function bildpfad(kennung: string): Promise<string | null> {
  if (!KENNUNG.test(kennung)) return null
  const pfad = join(await ordner(), `${kennung}.png`)
  const info = await stat(pfad).catch(() => null)
  return info !== null && info.isFile() ? pfad : null
}
