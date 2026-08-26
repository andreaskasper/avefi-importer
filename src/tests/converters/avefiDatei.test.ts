/*
 * Die Ausgabedatei avefi.v1.json.
 *
 * Zwei Eigenschaften, auf die es ankommt:
 *
 *   lesbar        Zwei Leerzeichen Einrueckung. Die datenstromfaehige Fassung
 *                 schrieb jeden Knoten in eine einzige Zeile; maschinell
 *                 gleichwertig, von Hand aber kaum noch zu pruefen — vom
 *                 Anwender gemeldet.
 *   wiederholbar  Gleiche Eingabe, zeichengleiche Ausgabe. Die Reihenfolge der
 *                 Felder haengt am Bauplan des Datensatzes, nicht am Zufall.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AvefiWriter, avefiPath } from '../../server/lib/storage.js'

const KNOTEN = [
  {
    category: 'avefi:WorkVariant',
    has_primary_title: { has_name: 'Sicherheit im Haushalt', type: 'PreferredTitle' },
    has_identifier: [{ category: 'avefi:LocalResource', id: 'r1_work' }]
  },
  {
    category: 'avefi:Manifestation',
    has_note: ['OV'],
    is_manifestation_of: [{ category: 'avefi:LocalResource', id: 'r1_work' }]
  }
]

let ordner = ''
const vorher = process.env.FILES_PATH

async function schreibe(id: string, knoten: readonly unknown[]): Promise<string> {
  const writer = await AvefiWriter.open(id)
  for (const k of knoten) await writer.write([k])
  await writer.close()
  return readFile(avefiPath(id), 'utf8')
}

beforeAll(async () => {
  ordner = await mkdtemp(join(tmpdir(), 'avefi-datei-'))
  process.env.FILES_PATH = ordner
})

afterAll(async () => {
  if (vorher === undefined) delete process.env.FILES_PATH
  else process.env.FILES_PATH = vorher
  await rm(ordner, { recursive: true, force: true })
})

describe('avefi.v1.json', () => {
  it('ist eingerueckt, nicht eine Zeile je Knoten', async () => {
    const text = await schreibe('eingerueckt', KNOTEN)
    const zeilen = text.split('\n')

    expect(zeilen[0]).toBe('[')
    expect(zeilen[1]).toBe('  {')
    // Ein Feld des ersten Knotens liegt zwei Stufen tief.
    expect(text).toContain('\n    "category": "avefi:WorkVariant"')
    // Verschachteltes eine Stufe tiefer.
    expect(text).toContain('\n      "has_name": "Sicherheit im Haushalt"')
    // Kein Knoten steht mehr in einer einzigen Zeile.
    expect(zeilen.filter((z) => z.includes('"category"') && z.includes('"has_identifier"'))).toHaveLength(0)
    expect(text.endsWith('\n]\n')).toBe(true)
  })

  it('bleibt gueltiges JSON mit allen Knoten', async () => {
    const text = await schreibe('gueltig', KNOTEN)
    const gelesen = JSON.parse(text) as unknown[]

    expect(gelesen).toHaveLength(2)
    expect(gelesen).toEqual(KNOTEN)
  })

  it('liefert bei gleicher Eingabe zeichengleiche Ausgabe', async () => {
    const a = await schreibe('lauf-a', KNOTEN)
    const b = await schreibe('lauf-b', KNOTEN)

    expect(a).toBe(b)
    // Die Reihenfolge der Schluessel steht fest, sie wird nicht sortiert.
    expect(a.indexOf('"category"')).toBeLessThan(a.indexOf('"has_primary_title"'))
  })

  it('eine leere Lieferung ist ein leeres Feld, kein kaputtes JSON', async () => {
    const writer = await AvefiWriter.open('leer')
    const geschlossen = await writer.close()
    const text = await readFile(avefiPath('leer'), 'utf8')

    expect(geschlossen.nodes).toBe(0)
    expect(text).toBe('[]\n')
    expect(JSON.parse(text)).toEqual([])
  })
})
