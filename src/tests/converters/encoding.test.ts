/*
 * Kodierung der Quelldatei.
 *
 * Anlass: Ein CSV-Export aus einem aelteren Tabellenprogramm wurde als UTF-8
 * gelesen, weil die Anwendung nichts anderes kannte. Aus "Franzoesisch" wurde
 * ein Wort mit Ersatzzeichen, das bis in die gespeicherte Werteliste des
 * Profils durchlief und dort neben dem richtigen Wert stehen blieb.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  encodingLabel, readCsvRows, readHead, sniffEncoding, sniffEncodingFromBuffer
} from '../../server/lib/converters/csv.js'

const dirs: string[] = []

async function fileWith(bytes: Buffer, name = 'probe.csv'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'avefi-enc-'))
  dirs.push(dir)
  const path = join(dir, name)
  await writeFile(path, bytes)
  return path
}

/** Dieselbe Kopfzeile und Zeile, einmal in jeder Kodierung. */
const TEXT = 'Titel;Sprache\nDie Stoerche;Franzoesisch\n'.replace('oe', '\u00f6').replace('oe', '\u00f6')

describe('Erkennung', () => {
  it('haelt reines ASCII fuer UTF-8', () => {
    expect(sniffEncodingFromBuffer(Buffer.from('Titel;Jahr\nA;1960\n', 'ascii'))).toBe('utf-8')
  })

  it('erkennt UTF-8 mit Umlauten', () => {
    expect(sniffEncodingFromBuffer(Buffer.from(TEXT, 'utf8'))).toBe('utf-8')
  })

  it('erkennt Windows-1252 daran, dass es kein gueltiges UTF-8 ist', () => {
    expect(sniffEncodingFromBuffer(Buffer.from(TEXT, 'latin1'))).toBe('windows-1252')
  })

  it('erkennt die Byte-Order-Marks', () => {
    expect(sniffEncodingFromBuffer(Buffer.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('utf-8')
    expect(sniffEncodingFromBuffer(Buffer.from([0xff, 0xfe, 0x41, 0x00]))).toBe('utf-16le')
    expect(sniffEncodingFromBuffer(Buffer.from([0xfe, 0xff, 0x00, 0x41]))).toBe('utf-16be')
  })

  it('benennt die Kodierung lesbar', () => {
    expect(encodingLabel('windows-1252')).toBe('Windows-1252')
    expect(encodingLabel('utf-8')).toBe('UTF-8')
  })
})

describe('Lesen', () => {
  it('liefert aus beiden Kodierungen dieselben Zellen', async () => {
    const utf8 = await fileWith(Buffer.from(TEXT, 'utf8'))
    const ansi = await fileWith(Buffer.from(TEXT, 'latin1'))
    expect(await sniffEncoding(ansi)).toBe('windows-1252')

    const rows = async (p: string): Promise<string[][]> => {
      const out: string[][] = []
      for await (const cells of readCsvRows(p, { delimiter: ';' })) out.push(cells)
      return out
    }
    const a = await rows(utf8)
    const b = await rows(ansi)
    expect(b).toEqual(a)
    // Und zwar richtig, nicht nur gleich falsch.
    expect(b[1]?.[1]).toBe('Franz\u00f6sisch')
  })

  it('liest auch den Kopf der Datei in ihrer Kodierung', async () => {
    const ansi = await fileWith(Buffer.from(TEXT, 'latin1'))
    expect(await readHead(ansi)).toContain('Franz\u00f6sisch')
  })
})

afterAll(async () => {
  const { rm } = await import('node:fs/promises')
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})
