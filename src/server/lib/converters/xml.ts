/*
 * XML-Helfer.
 *
 * fast-xml-parser liest ein ganzes Dokument in den Speicher. Fuer die grossen
 * Lieferungen (die LIDO-Datei hatte rund 68 MB) ist das zu viel, deshalb wird
 * die Datei hier zuerst im Datenstrom in Datensatz-Bruchstuecke zerlegt; jedes
 * Bruchstueck wird dann einzeln geparst. Das entspricht dem, was der PHP-Stand
 * mit XMLReader::expand() gemacht hat, nur mit der vorgegebenen Bibliothek.
 *
 * Elementnamen werden ohne Namensraum verglichen. Ob eine Datei
 * <marc:record> oder <record> schreibt, ist fuer die Auswertung belanglos.
 */
import { createReadStream } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
})

/** Parst ein Bruchstueck XML zu einem Objektbaum. */
export function parseFragment(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>
}

/** Elementname ohne Namensraum. */
export function localName(tag: string): string {
  const bare = tag.split(/[\s/>]/)[0] ?? tag
  const colon = bare.lastIndexOf(':')
  return (colon >= 0 ? bare.slice(colon + 1) : bare).toLowerCase()
}

export interface XmlElementChunk {
  /** Elementname ohne Namensraum, klein geschrieben. */
  name: string
  /** Name des umschliessenden Elements, klein geschrieben (oder ''). */
  parent: string
  /** Das vollstaendige Element samt Inhalt. */
  xml: string
}

/**
 * Liest die Datei im Datenstrom und liefert jedes Element, dessen Name in
 * `wanted` steht, als Bruchstueck. Verschachtelte Treffer werden uebersprungen:
 * Beim aeussersten Treffer wird gesammelt, bis er geschlossen ist.
 */
export async function* streamElements(path: string, wanted: readonly string[]): AsyncGenerator<XmlElementChunk> {
  const targets = new Set(wanted.map((w) => w.toLowerCase()))
  const stack: string[] = []
  let buffer = ''
  let capturing: { name: string; parent: string; depth: number; text: string } | null = null

  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 256 * 1024 })
  for await (const chunk of stream) {
    buffer += chunk as string
    // Bis zum letzten vollstaendigen Tag verarbeiten; ein angebrochenes Tag
    // bleibt im Puffer, damit es nicht mitten im Namen zerschnitten wird.
    const lastOpen = buffer.lastIndexOf('<')
    const lastClose = buffer.lastIndexOf('>')
    const usable = lastClose > lastOpen ? buffer.length : lastOpen < 0 ? buffer.length : lastOpen
    const work = buffer.slice(0, usable)
    buffer = buffer.slice(usable)

    for (const piece of scan(work, stack, capturing, targets)) {
      if (piece.kind === 'state') {
        capturing = piece.capturing
        continue
      }
      yield piece.chunk
    }
  }

  // Rest verarbeiten.
  for (const piece of scan(buffer, stack, capturing, targets)) {
    if (piece.kind === 'state') {
      capturing = piece.capturing
      continue
    }
    yield piece.chunk
  }
}

type ScanPiece =
  | { kind: 'state'; capturing: { name: string; parent: string; depth: number; text: string } | null }
  | { kind: 'chunk'; chunk: XmlElementChunk }

/**
 * Durchlaeuft ein Textstueck, pflegt den Elementstapel und schneidet die
 * gewuenschten Elemente heraus. Kommentare, Verarbeitungsanweisungen und
 * CDATA-Abschnitte werden uebersprungen.
 */
function* scan(
  text: string,
  stack: string[],
  capturing: { name: string; parent: string; depth: number; text: string } | null,
  targets: ReadonlySet<string>
): Generator<ScanPiece> {
  let i = 0
  let plainStart = 0

  const flushPlain = (until: number): void => {
    if (capturing) capturing.text += text.slice(plainStart, until)
  }

  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) break

    // Kommentar / CDATA / Deklaration ueberspringen.
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt)
      i = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt)
      i = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<?', lt) || text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt)
      i = end < 0 ? text.length : end + 1
      continue
    }

    const gt = text.indexOf('>', lt)
    if (gt < 0) break
    const tag = text.slice(lt + 1, gt)
    const selfClosing = tag.endsWith('/')
    const isEnd = tag.startsWith('/')
    const name = localName(isEnd ? tag.slice(1) : tag)

    if (isEnd) {
      if (capturing) {
        if (name === capturing.name) {
          capturing.depth--
          if (capturing.depth === 0) {
            flushPlain(lt)
            capturing.text += text.slice(lt, gt + 1)
            yield { kind: 'chunk', chunk: { name: capturing.name, parent: capturing.parent, xml: capturing.text } }
            capturing = null
            yield { kind: 'state', capturing: null }
            plainStart = gt + 1
            i = gt + 1
            stack.pop()
            continue
          }
        }
      }
      stack.pop()
      i = gt + 1
      continue
    }

    if (!capturing && targets.has(name) && !selfClosing) {
      flushPlain(lt)
      capturing = { name, parent: stack[stack.length - 1] ?? '', depth: 1, text: text.slice(lt, gt + 1) }
      yield { kind: 'state', capturing }
      plainStart = gt + 1
      stack.push(name)
      i = gt + 1
      continue
    }

    if (capturing && name === capturing.name && !selfClosing) capturing.depth++
    if (!selfClosing) stack.push(name)
    i = gt + 1
  }

  flushPlain(text.length)
  plainStart = 0
}

/** Erste Textfundstelle eines Nachfahren mit gegebenem Namen. */
export function text(node: unknown, name: string): string | null {
  const values = texts(node, name)
  return values.length > 0 ? (values[0] as string) : null
}

/** Alle Texte von Nachfahren mit gegebenem Namen. */
export function texts(node: unknown, name: string): string[] {
  const out: string[] = []
  collect(node, name.toLowerCase(), out)
  return out
}

function collect(node: unknown, name: string, out: string[]): void {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const n of node) collect(n, name, out)
    return
  }
  if (typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith('@_')) continue
    if (key.toLowerCase() === name) {
      for (const v of flattenText(value)) {
        const c = clean(v)
        if (c !== '') out.push(c)
      }
      continue
    }
    collect(value, name, out)
  }
}

function flattenText(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((v) => flattenText(v))
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('#text' in obj) return flattenText(obj['#text'])
    return Object.entries(obj)
      .filter(([k]) => !k.startsWith('@_'))
      .flatMap(([, v]) => flattenText(v))
  }
  return []
}

/** Elemente eines Namens als Knoten (nicht als Text). */
export function nodes(node: unknown, name: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  collectNodes(node, name.toLowerCase(), out)
  return out
}

function collectNodes(node: unknown, name: string, out: Record<string, unknown>[]): void {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const n of node) collectNodes(n, name, out)
    return
  }
  if (typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith('@_')) continue
    if (key.toLowerCase() === name) {
      const list = Array.isArray(value) ? value : [value]
      for (const v of list) {
        out.push(typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : { '#text': v })
      }
      continue
    }
    collectNodes(value, name, out)
  }
}

export function attr(node: Record<string, unknown> | null | undefined, name: string): string | null {
  if (!node) return null
  const v = node[`@_${name}`]
  return v === undefined || v === null ? null : String(v)
}

/**
 * Mehrfachen Leerraum zusammenziehen und die Raender trimmen.
 *
 * Anders als im PHP-Stand werden hier KEINE Satzzeichen abgeschnitten. Dort
 * stand " \t\n\r\0\x0B/:;,." in der Trimliste, wodurch jeder XML-Text seinen
 * Schlusspunkt verlor — aus dem Titel "Dr. Mabuse, der Spieler." wurde
 * "Dr. Mabuse, der Spieler". Fuer MARC-Interpunktion mag das gemeint gewesen
 * sein, fuer Titel ist es stiller Datenverlust.
 */
export function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Ein Titelbestandteil in MARC endet oft auf " /" oder " :" — nur dort entfernen. */
export function trimMarcPunctuation(s: string): string {
  return s.replace(/\s*[/:;,]\s*$/, '').trim()
}

export function year(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /(\d{4})/.exec(s)
  return m && m[1] ? Number(m[1]) : null
}

export function minutes(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /(\d+)\s*min/i.exec(s)
  return m && m[1] ? Number(m[1]) : null
}
