/*
 * Struktur-Fingerabdruck einer Quelldatei.
 *
 * Der Fingerabdruck dient nur noch den NICHT tabellarischen Formaten (JSON,
 * XML, EAD, MARC-XML). Tabellen laufen ueber den Kopfzeilen-Hash und ein
 * Mappingprofil — dafuer gibt es im Typ isTabular(). Die alte
 * FingerprintRegistry war fuer Tabellen ohnehin tote Logik: Ihre Zuordnungs-
 * tabelle war leer und ist es nie geworden.
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { BaseFormat } from '#shared/types/domain'
import { streamElements, localName } from './xml'
import { readHead } from './csv'

export interface Analysis {
  fingerprint: string
  /** Bei JSON die Schluessel, bei XML die Namen der Kindelemente. */
  columns: string[]
  /** Strukturprobe fuer die Anzeige im Format-Review. */
  sample: unknown
}

export async function analyzeStructure(path: string, baseFormat: BaseFormat | null): Promise<Analysis> {
  if (baseFormat === 'json') return analyzeJson(path)
  return analyzeXml(path)
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}

async function analyzeJson(path: string): Promise<Analysis> {
  let data: unknown = null
  try {
    data = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return { fingerprint: sha1('json:'), columns: [], sample: [] }
  }

  let keys: string[] = []
  let sample: unknown = []
  if (Array.isArray(data)) {
    const first = data[0]
    if (first !== null && typeof first === 'object') keys = Object.keys(first as Record<string, unknown>)
    sample = data.slice(0, 2)
  } else if (data !== null && typeof data === 'object') {
    keys = Object.keys(data as Record<string, unknown>)
    sample = [data]
  }
  const normalized = keys.map((k) => k.toLowerCase()).sort()
  return { fingerprint: sha1(`json:${normalized.join(',')}`), columns: keys, sample }
}

/**
 * XML: Wurzelelement, Namensraum und die Namen der Kindelemente auf Ebene 1.
 * Gelesen wird nur der Anfang der Datei — fuer die Struktur reicht das, und
 * eine 68-MB-Datei muss dafuer nicht durch den Parser.
 */
async function analyzeXml(path: string): Promise<Analysis> {
  const head = await readHead(path, 256 * 1024)
  let root = ''
  let namespace = ''
  const children = new Set<string>()

  const tagPattern = /<([A-Za-z_][^\s>/!?]*)([^>]*)>/g
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(head)) !== null) {
    const raw = match[1] ?? ''
    const attrs = match[2] ?? ''
    const selfClosing = attrs.trimEnd().endsWith('/')
    const name = localName(raw)
    if (root === '') {
      root = name
      const ns = /xmlns(?::[A-Za-z0-9_-]+)?\s*=\s*"([^"]*)"/.exec(attrs)
      namespace = ns?.[1] ?? ''
      if (!selfClosing) depth = 1
      continue
    }
    if (depth === 1) {
      children.add(name)
      if (children.size > 60) break
    }
    if (!selfClosing) depth++
    // Schliessende Elemente zaehlt dieses Muster nicht mit; fuer die
    // Ebene-1-Namen genuegt die Naeherung, weil bereits der erste Treffer je
    // Name zaehlt.
  }

  // Genauer: die tatsaechlichen Kinder der Wurzel im Datenstrom nachziehen.
  if (root !== '') {
    let seen = 0
    for await (const el of streamElements(path, [root])) {
      const inner = /<([A-Za-z_][^\s>/!?]*)/g
      let m: RegExpExecArray | null
      while ((m = inner.exec(el.xml)) !== null) {
        const n = localName(m[1] ?? '')
        if (n === root) continue
        children.add(n)
        if (children.size > 60) break
      }
      seen++
      if (seen >= 1) break
    }
  }

  const names = [...children].sort()
  return {
    fingerprint: sha1(`xml:${root}|${namespace}|${names.join(',')}`),
    columns: names,
    sample: { root, namespace, children: names }
  }
}
