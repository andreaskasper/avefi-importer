/*
 * Der Vorschlag fuer eingeklammerte Titel.
 *
 * Anlass ist Jasper Stratils Test vom 07.09.2026 mit UPB_Test_Archivtitel.csv:
 * Im LIDO-Weg wertet der Konverter eckige Klammern als Archivtitel aus, im
 * CSV-Weg greift das nicht. Eine feste Regel waere hier falsch — der CSV-Weg
 * kennt das liefernde Haus nicht. Ein Vorschlag, den ein Mensch annimmt und
 * der danach im Profil steht, ist die Antwort.
 */

import { describe, expect, it } from 'vitest'
import { bracketTitleChecks, pickExamples } from '../../server/lib/mapping/preview.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { runRow } from '../../server/lib/mapping/runner.js'
import { testSchema } from './fixtures.js'
import type { DismissedHint } from '#shared/types/domain'

function profil(ziel = 'work.title.primary', dismissed?: DismissedHint[], post: unknown[] = []) {
  const m = emptyMapping(['Titel'])
  m.columns['Titel'] = {
    pre: [],
    targets: [{ target: ziel, post: post as never }],
    ...(dismissed ? { dismissed } : {})
  }
  return m
}

function pruefe(werte: string[], ...args: Parameters<typeof profil>) {
  const spalten = pickExamples(['Titel'], werte.map((Titel) => ({ Titel })))
  return bracketTitleChecks(profil(...args), spalten)
}

const GEMISCHT = ['Der blaue Engel', '[Betriebsausflug 1962]', 'M', '[ohne Titel]']
const ALLE = ['[Betriebsausflug 1962]', '[ohne Titel]', '[Aufnahmen Hafen]']
const KEINE = ['Der blaue Engel', 'M', 'Metropolis']

describe('Wann der Vorschlag erscheint', () => {
  it('bei gemischter Spalte: aufteilen', () => {
    const c = pruefe(GEMISCHT)
    expect(c.map((x) => x.code)).toEqual(['data.bracketTitle'])
    expect(c[0]?.fixPlan?.length).toBe(2)
  })

  it('bei durchgehend eingeklammerter Spalte: umhaengen statt aufteilen', () => {
    const c = pruefe(ALLE)
    expect(c.map((x) => x.code)).toEqual(['data.bracketTitleAll'])
    expect(c[0]?.fixPlan?.length).toBe(1)
    expect(c[0]?.fixPlan?.[0]?.replaces).toBe('work.title.primary')
    expect(c[0]?.fixPlan?.[0]?.target).toBe('work.title.supplied')
  })

  it('gar nicht, wenn keine Klammern vorkommen', () => {
    expect(pruefe(KEINE)).toEqual([])
  })

  it('gar nicht bei zu wenigen Werten', () => {
    // Ein einziger eingeklammerter Wert ist kein Muster, sondern ein Wert.
    expect(pruefe(['[Betriebsausflug]'])).toEqual([])
  })
})

describe('Wo der Vorschlag nicht hingehoert', () => {
  it('nicht an einem mehrwertigen Ziel', () => {
    // Dort draengen sich zwei Titel nicht gegenseitig weg, also gibt es nichts
    // zu entscheiden.
    expect(pruefe(GEMISCHT, 'work.title.alternative')).toEqual([])
  })

  it('nicht am Archivtitel selbst', () => {
    expect(pruefe(GEMISCHT, 'work.title.supplied')).toEqual([])
  })

  it('nicht an einem Ziel ausserhalb der Titel', () => {
    expect(pruefe(GEMISCHT, 'item.note')).toEqual([])
  })

  it('nicht, wenn die Kette schon einen Waechter hat', () => {
    const post = [{ op: 'only', pattern: '^\\[.*\\]$', negate: true }]
    expect(pruefe(GEMISCHT, 'work.title.primary', undefined, post)).toEqual([])
  })

  it('nicht, wenn die Kette die Klammern schon behandelt', () => {
    const post = [{ op: 'regex', pattern: '^\\[(.*)\\]$', capture: 1 }]
    expect(pruefe(GEMISCHT, 'work.title.primary', undefined, post)).toEqual([])
  })
})

describe('Ablehnen', () => {
  it('haelt den Vorschlag fern', () => {
    const weg: DismissedHint[] = [{ code: 'data.bracketTitle', target: 'work.title.primary' }]
    expect(pruefe(GEMISCHT, 'work.title.primary', weg)).toEqual([])
  })

  it('gilt je Code: wer das Aufteilen ablehnt, hat zum Umhaengen nichts gesagt', () => {
    const weg: DismissedHint[] = [{ code: 'data.bracketTitle', target: 'work.title.primary' }]
    expect(pruefe(ALLE, 'work.title.primary', weg).map((x) => x.code)).toEqual(['data.bracketTitleAll'])
  })
})

describe('Der Plan selbst', () => {
  it('teilt so auf, dass je Zeile genau ein Zweig etwas bekommt', () => {
    const plan = pruefe(GEMISCHT)[0]?.fixPlan ?? []
    const haupt = plan.find((p) => p.target === 'work.title.primary')
    const archiv = plan.find((p) => p.target === 'work.title.supplied')
    expect(haupt?.post?.[0]).toMatchObject({ op: 'only', negate: true })
    expect(archiv?.post?.[0]).toMatchObject({ op: 'only', capture: 1 })
  })

  it('verankert beide Muster auf den ganzen Wert', () => {
    for (const teil of pruefe(GEMISCHT)[0]?.fixPlan ?? []) {
      const muster = String(teil.post?.[0]?.pattern ?? '')
      expect(muster.startsWith('^')).toBe(true)
      expect(muster.endsWith('$')).toBe(true)
    }
  })

  it('nennt die Ebene des betroffenen Ziels, nicht immer das Werk', () => {
    const c = pruefe(ALLE, 'item.title.primary')
    expect(c[0]?.fixPlan?.[0]?.target).toBe('item.title.supplied')
  })
})

describe('Der angenommene Vorschlag im fertigen Datensatz', () => {
  /*
   * Der eigentliche Nachweis: Nicht dass ein Plan entsteht, sondern dass das
   * JSON hinterher stimmt. Der Plan wird hier so angewandt, wie der Editor ihn
   * anwendet — Ziel plus Nachkette —, und dann laeuft eine Zeile durch.
   */
  const services = { schema: testSchema }

  function mitPlan() {
    const m = emptyMapping(['Titel'], '1.2.3')
    const plan = pruefe(GEMISCHT)[0]?.fixPlan ?? []
    m.columns['Titel'] = {
      pre: [],
      targets: plan.map((t) => ({ target: t.target, post: (t.post ?? []) as never }))
    }
    return m
  }

  it('macht aus einem eingeklammerten Titel einen Archivtitel ohne Klammern', () => {
    const r = runRow(mitPlan(), { Titel: '[Betriebsausflug 1962]' }, 'z1', services)
    expect(r.canonical.work['has_primary_title'])
      .toEqual({ has_name: 'Betriebsausflug 1962', type: 'SuppliedDevisedTitle' })
  })

  it('laesst einen gewoehnlichen Titel Haupttitel bleiben', () => {
    const r = runRow(mitPlan(), { Titel: 'Der blaue Engel' }, 'z2', services)
    expect(r.canonical.work['has_primary_title'])
      .toEqual({ has_name: 'Der blaue Engel', type: 'PreferredTitle' })
  })

  it('deutet einen Zusatz in Klammern nicht um', () => {
    const r = runRow(mitPlan(), { Titel: 'Der blaue Engel [Fragment]' }, 'z3', services)
    expect(r.canonical.work['has_primary_title'])
      .toEqual({ has_name: 'Der blaue Engel [Fragment]', type: 'PreferredTitle' })
  })

  it('erzeugt nie zwei Primaertitel und beanstandet nichts', () => {
    for (const wert of GEMISCHT) {
      const r = runRow(mitPlan(), { Titel: wert }, 'z', services)
      expect(r.canonical.work['has_primary_title']).toBeDefined()
      expect(r.canonical.work['has_alternative_title']).toBeUndefined()
      expect(r.errors ?? []).toEqual([])
    }
  })
})
