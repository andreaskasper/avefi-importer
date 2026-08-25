import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readTable, toProfileSample } from '../../server/lib/converters/table'
import { headerHash } from '../../server/lib/mapping/header'

let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'avefi-table-'))
})

afterAll(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

async function write(name: string, content: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, content, 'utf8')
  return path
}

describe('Tabelle lesen', () => {
  it('liest Kopfzeile, Zeilen und Belegung', async () => {
    const path = await write(
      'filme.csv',
      'Titel;Jahr;Land\nMetropolis;1927;DE\nNosferatu;1922;\n\nBerlin;1927;DE\n'
    )
    const info = await readTable(path, 'csv')
    expect(info.delimiter).toBe(';')
    expect(info.columns).toEqual(['Titel', 'Jahr', 'Land'])
    expect(info.rowCount).toBe(3)
    expect(info.coverage.Land).toEqual({ filled: 2, total: 3 })
    expect(info.distinct.Jahr?.[0]).toEqual({ value: '1927', count: 2 })
  })

  it('macht doppelte Spaltennamen eindeutig', async () => {
    const path = await write('doppelt.csv', 'Titel,Titel,Jahr\na,b,1927\n')
    const info = await readTable(path, 'csv')
    expect(info.columns).toEqual(['Titel', 'Titel (2)', 'Jahr'])
  })

  it('bildet denselben Hash bei anderer Spaltenreihenfolge', async () => {
    const a = await readTable(await write('a.csv', 'Titel,Jahr\nx,1\n'), 'csv')
    const b = await readTable(await write('b.csv', 'Jahr,Titel\n1,x\n'), 'csv')
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toBe(headerHash(['Titel', 'Jahr'], 'csv'))
  })

  it('zaehlt Zeilen mit abweichender Feldzahl', async () => {
    const path = await write('kaputt.csv', 'Titel,Jahr\nMetropolis,1927,zuviel\nNosferatu,1922\n')
    const info = await readTable(path, 'csv')
    expect(info.raggedRows).toBe(1)
  })

  it('liefert eine Stichprobe fuer das Profil', async () => {
    const path = await write('probe.csv', 'Titel,Jahr\nMetropolis,1927\nNosferatu,1922\n')
    const sample = toProfileSample(await readTable(path, 'csv'))
    expect(sample.columns).toEqual(['Titel', 'Jahr'])
    expect(sample.rows[0]).toEqual(['Metropolis', '1927'])
    expect(sample.coverage?.Titel).toEqual({ filled: 2, total: 2 })
  })
})
