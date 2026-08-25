import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { locateJsonError } from '../../server/lib/converters/jsonLint'
import { analyzeParse } from '../../server/lib/converters/parseDiagnostics'
import { describeFormat } from '../../server/lib/converters/formatGuess'

let dir = ''
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'avefi-diag-'))
})
afterAll(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

async function write(name: string, content: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, content, 'utf8')
  return path
}

describe('JSON-Fehler orten', () => {
  it('meldet nichts bei gueltigem JSON', () => {
    expect(locateJsonError('{"a":[1,2,3]}')).toBeNull()
  })

  it('findet ein ueberzaehliges Komma mit Zeile und Spalte', () => {
    const loc = locateJsonError('{\n  "a": 1,\n}\n')
    expect(loc?.line).toBe(3)
    expect(loc?.message).toContain('Komma')
  })

  it('findet eine nicht geschlossene Zeichenkette', () => {
    const loc = locateJsonError('{\n  "titel": "Metropolis\n}\n')
    expect(loc?.line).toBe(2)
    expect(loc?.message).toContain('Zeichenkette')
  })

  it('weist einfache Anfuehrungszeichen zurueck', () => {
    const loc = locateJsonError("{'a': 1}")
    expect(loc?.message).toContain('einfachen')
  })
})

describe('Diagnose', () => {
  it('meldet eine CSV ohne Datenzeilen als Fehler', async () => {
    const d = await analyzeParse(await write('leer.csv', 'Titel,Jahr\n'), 'csv')
    expect(d.ok).toBe(false)
    expect(d.errors[0]?.message).toContain('keine Datenzeilen')
  })

  it('meldet ungleiche Feldzahlen als Warnung, nicht als Fehler', async () => {
    const d = await analyzeParse(await write('schief.csv', 'a,b\n1,2,3\n4,5\n'), 'csv')
    expect(d.ok).toBe(true)
    expect(d.errors[0]?.severity).toBe('warning')
  })

  it('haelt kaputtes XML mit Position fest', async () => {
    const d = await analyzeParse(await write('kaputt.xml', '<a><b></a>\n'), 'xml')
    expect(d.ok).toBe(false)
    expect(d.errors[0]?.snippet).not.toBeNull()
  })

  it('behandelt ein unbekanntes Basisformat nicht mehr wie XML', async () => {
    // Der PHP-Stand fiel im default-Zweig auf XML zurueck; eine Excel-Datei
    // bekam so den Befund "XML (fehlerhaft)".
    const d = await analyzeParse(await write('unbekannt.bin', 'PKirgendwas'), null)
    expect(d.format).not.toBe('XML')
    expect(d.ok).toBe(true)
  })
})

describe('Formatbezeichnung', () => {
  const leer = { fingerprint: '', columns: [] as string[], sample: {} }

  it('nennt eine Arbeitsmappe beim Namen', () => {
    expect(describeFormat('xlsx', leer)).toBe('Excel-Arbeitsmappe')
  })

  it('erkennt eine Excel-2003-XML-Datei', () => {
    expect(describeFormat('xml', { fingerprint: '', columns: [], sample: { root: 'workbook', namespace: '' } })).toContain('Excel 2003')
  })

  it('sagt bei unbekanntem Format, dass es unbekannt ist', () => {
    expect(describeFormat(null, leer)).toBe('Format unbekannt')
  })
})
