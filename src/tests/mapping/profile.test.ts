/* Profil — dritter Spaltenzustand, Migration, Abgleich, Export. */

import { describe, expect, it } from 'vitest'
import {
  adoptMapping, buildProfileExport, checkProfileColumns, columnState, columnStates,
  computeComplete, emptyMapping, normalizeMapping, normalizeSample, openColumns,
  PROFILE_FORMAT_VERSION, readProfileExport, suggestProfileName, targetHintsFromMappings
} from '../../server/lib/mapping/profile.js'
import { demoMapping } from './fixtures.js'

describe('Dritter Spaltenzustand', () => {
  it('unterscheidet gemappt, ignoriert und noch nicht angefasst', () => {
    expect(columnState({ pre: [], targets: [{ target: 'work.title.primary', post: [] }] })).toBe('mapped')
    expect(columnState({ ignore: true })).toBe('ignored')
    expect(columnState({ pre: [], targets: [] })).toBe('untouched')
    expect(columnState(undefined)).toBe('untouched')
  })

  it('haelt ein Profil mit offener Spalte fuer unvollstaendig', () => {
    const m = emptyMapping(['Titel', 'Rest'])
    m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    expect(computeComplete(m)).toBe(false)
    expect(openColumns(m)).toEqual(['Rest'])
  })

  it('haelt ein Profil fuer vollstaendig, sobald jede Spalte beantwortet ist', () => {
    const m = emptyMapping(['Titel', 'Rest'])
    m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    m.columns['Rest'] = { ignore: true }
    expect(computeComplete(m)).toBe(true)
    expect(columnStates(m)).toEqual({ Titel: 'mapped', Rest: 'ignored' })
  })

  it('haelt ein rein ignorierendes Profil nicht fuer fertig', () => {
    const m = emptyMapping(['A', 'B'])
    m.columns['A'] = { ignore: true }
    m.columns['B'] = { ignore: true }
    expect(computeComplete(m)).toBe(false)
  })

  it('haelt ein Profil ohne Spalten nicht fuer fertig', () => {
    expect(computeComplete(emptyMapping([]))).toBe(false)
  })
})

describe('Neues Profil', () => {
  it('traegt Profilformat- und Schemaversion', () => {
    const m = emptyMapping(['A'], '1.2.3')
    expect(m.profileFormatVersion).toBe(PROFILE_FORMAT_VERSION)
    expect(m.avefiSchemaVersion).toBe('1.2.3')
    expect(m.grouping.work.by).toEqual([])
    expect(m.row.represents).toBe('item')
  })

  it('schlaegt einen Namen vor', () => {
    expect(suggestProfileName('Filmarchiv X', 'bestand-2026.csv')).toBe('Filmarchiv X · bestand-2026')
    expect(suggestProfileName(null, '.csv')).toBe('Tabelle')
  })
})

describe('Einlesen alter Profile', () => {
  it('ergaenzt die fehlenden Versionsangaben vertraeglich', () => {
    const { mapping, issues } = normalizeMapping(
      { version: 1, columns: { Titel: { pre: [], targets: [{ target: 'work.title.primary', post: [] }] } } },
      { avefiSchemaVersion: '1.2.3' }
    )
    expect(mapping.profileFormatVersion).toBe(1)
    expect(mapping.avefiSchemaVersion).toBe('1.2.3')
    expect(issues.some((i) => i.code === 'profile.version-added')).toBe(true)
    expect(issues.some((i) => i.code === 'profile.schema-version-added')).toBe(true)
  })

  it('meldet eine abweichende Schemaversion', () => {
    const { issues } = normalizeMapping(
      { profileFormatVersion: 1, avefiSchemaVersion: '1.0.0', columns: {} },
      { avefiSchemaVersion: '1.2.3' }
    )
    expect(issues.some((i) => i.code === 'profile.schema-version-mismatch')).toBe(true)
  })

  it('zieht umbenannte Konverter mit', () => {
    const { mapping, issues } = normalizeMapping({
      columns: { Farbe: { pre: [{ op: 'valuemap', map: { sw: 'BlackAndWhite' } }, { op: 'ucfirst' }], targets: [] } }
    })
    expect(mapping.columns['Farbe']?.pre?.map((s) => s.op)).toEqual(['map', 'titlecase'])
    expect(issues.filter((i) => i.code === 'chain.renamed-op').length).toBe(2)
  })

  it('wandelt die alte Kurzform in ein Objekt', () => {
    const { mapping, issues } = normalizeMapping({ columns: { A: { pre: ['trim'], targets: [] } } })
    expect(mapping.columns['A']?.pre).toEqual([{ op: 'trim' }])
    expect(issues.some((i) => i.code === 'chain.shorthand')).toBe(true)
  })

  it('entfernt unbekannte Konverter und sagt es', () => {
    const { mapping, issues } = normalizeMapping({ columns: { A: { pre: [{ op: 'zaubern' }], targets: [] } } })
    expect(mapping.columns['A']?.pre).toEqual([])
    expect(issues.some((i) => i.code === 'chain.unknown-op')).toBe(true)
  })

  it('verteilt frueher global gefuehrte Normdaten auf die nachschlagenden Spalten', () => {
    const { mapping } = normalizeMapping({
      authorities: { gnd: { 'Anna Mueller': { id: '999', label: 'Mueller, Anna' } } },
      columns: {
        Regie: { pre: [{ op: 'authority', source: 'gnd' }], targets: [] },
        Titel: { pre: [], targets: [] }
      }
    })
    expect(mapping.columns['Regie']?.authorities?.['Anna Mueller']?.id).toBe('999')
    expect(mapping.columns['Titel']?.authorities).toBeUndefined()
  })

  it('nimmt Spalten der Kopfzeile als noch nicht angefasst dazu', () => {
    const { mapping } = normalizeMapping({ columns: {} }, { columns: ['Neu'] })
    expect(columnState(mapping.columns['Neu'])).toBe('untouched')
  })
})

describe('Abgleich mit der Kopfzeile', () => {
  it('zeigt fehlende, zusaetzliche und passende Spalten', () => {
    const m = emptyMapping(['Titel', 'Regie'])
    const report = checkProfileColumns(m, ['Titel', 'Laufzeit'])
    expect(report.matched).toEqual(['Titel'])
    expect(report.missing).toEqual(['Regie'])
    expect(report.extra).toEqual(['Laufzeit'])
    expect(report.usable).toBe(true)
    expect(report.summary).toContain('1 von 2')
  })

  it('haelt ein Profil ohne einzige Uebereinstimmung fuer unbrauchbar', () => {
    expect(checkProfileColumns(emptyMapping(['A']), ['B']).usable).toBe(false)
  })
})

describe('Fremdes Profil uebernehmen', () => {
  it('setzt gleichnamige Spalten um und laesst die uebrigen offen', () => {
    const foreign = emptyMapping(['titel', 'regie'], '1.2.3')
    foreign.columns['titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    foreign.columns['regie'] = { pre: [], targets: [{ target: 'work.activity.directing', post: [] }] }

    const r = adoptMapping(foreign, ['Titel', 'Laufzeit'])
    expect(r.matched).toEqual(['Titel'])
    expect(r.missing).toEqual(['Laufzeit'])
    expect(r.extra).toEqual(['regie'])
    expect(columnState(r.mapping.columns['Titel'])).toBe('mapped')
    expect(columnState(r.mapping.columns['Laufzeit'])).toBe('untouched')
    expect(computeComplete(r.mapping)).toBe(false)
  })

  it('zaehlt Zielvorschlaege aus mehreren fremden Profilen', () => {
    const a = emptyMapping(['Titel'])
    a.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    const b = emptyMapping(['titel'])
    b.columns['titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    const hints = targetHintsFromMappings(['Titel'], [a, b])
    expect(hints['Titel']).toEqual([{ target: 'work.title.primary', count: 2 }])
  })
})

describe('Export und Reimport', () => {
  const sample = { columns: ['Titel'], rows: [['A']], coverage: { Titel: { filled: 1, total: 1 } } }

  it('baut eine Exportdatei samt Stichprobe', () => {
    const e = buildProfileExport(demoMapping(), sample, {
      profileName: 'Test', profileVersion: 3, baseFormat: 'csv', headerHash: 'abc'
    })
    expect(e.origin.application).toBe('avefi-importer')
    expect(e.profileFormatVersion).toBe(1)
    expect(e.avefiSchemaVersion).toBe('1.2.3')
    expect(e.sample?.columns).toEqual(['Titel'])
  })

  it('liest die eigene Exportdatei wieder ein', () => {
    const e = buildProfileExport(demoMapping(), sample, {
      profileName: 'Test', profileVersion: 3, baseFormat: 'csv', headerHash: 'abc'
    })
    const back = readProfileExport(JSON.parse(JSON.stringify(e)))
    expect(back.export?.headerHash).toBe('abc')
    expect(Object.keys(back.export?.mapping.columns ?? {})).toContain('Titel')
    expect(back.issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('warnt bei fehlender Stichprobe und fremder Herkunft', () => {
    const back = readProfileExport({ origin: { application: 'sonstwas' }, mapping: { columns: {} } })
    expect(back.issues.some((i) => i.code === 'export.foreign')).toBe(true)
    expect(back.issues.some((i) => i.code === 'export.no-sample')).toBe(true)
  })

  it('lehnt Unlesbares ab', () => {
    const back = readProfileExport('kein Profil')
    expect(back.export).toBeNull()
    expect(back.issues[0]?.severity).toBe('error')
  })

  it('deckelt die Stichprobe beim Einlesen', () => {
    const rows = Array.from({ length: 40 }, (_, i) => [String(i)])
    expect(normalizeSample({ columns: ['A'], rows })?.rows.length).toBe(25)
    expect(normalizeSample({ columns: [] })).toBeNull()
  })
})

describe('abgelehnte Hinweise', () => {
  /* Der Grund fuer diesen Test: normalizeMapping baut den Spaltensatz neu auf
   * und uebernimmt nur, was es kennt. Die Ablehnung war zuerst nur im Browser
   * gesetzt, fiel beim ersten Aufruf der Vorschau wieder heraus, und der
   * Vorschlag stand wieder da. Sichtbar wurde das erst beim Klicken. */
  it('ueberleben das Einlesen', () => {
    const { mapping } = normalizeMapping({
      columns: {
        Inhalt: {
          pre: [], targets: [{ target: 'item.note', post: [] }],
          dismissed: [{ code: 'data.separator', target: 'item.note', sep: ';' }]
        }
      }
    })
    expect(mapping.columns['Inhalt']?.dismissed).toEqual([
      { code: 'data.separator', target: 'item.note', sep: ';' }
    ])
  })

  it('werfen unbrauchbare Eintraege weg', () => {
    const { mapping } = normalizeMapping({
      columns: { Inhalt: { dismissed: [{ target: 'item.note' }, 'unsinn', { code: 'data.separator' }] } }
    })
    expect(mapping.columns['Inhalt']?.dismissed).toEqual([{ code: 'data.separator' }])
  })
})
