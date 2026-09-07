/*
 * Zweigbilanz und verdraengter Primaertitel.
 *
 * Beides sind Gegenstuecke zum Waechter "Nur wenn": Er verwirft still, damit
 * eine Verzweigung ueberhaupt moeglich ist. Was er wegwirft, muss dafuer an
 * anderer Stelle sichtbar werden — sonst waere er genau die stille Korrektur,
 * die dieses Projekt sonst vermeidet.
 */

import { describe, expect, it } from 'vitest'
import { buildPreview } from '../../server/lib/mapping/preview.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'
import { runRow } from '../../server/lib/mapping/runner.js'
import { testSchema } from './fixtures.js'
import type { MappingJson } from '#shared/types/domain'

const HAUPT = { op: 'only', pattern: '^\\[.*\\]$', negate: true }
const ARCHIV = { op: 'only', pattern: '^\\[(.*)\\]$', capture: 1 }

function profil(post1: unknown, post2: unknown): MappingJson {
  const m = emptyMapping(['Titel'], '1.2.3')
  m.columns['Titel'] = {
    pre: [],
    targets: [
      { target: 'work.title.primary', post: [post1] as never },
      { target: 'work.title.supplied', post: [post2] as never }
    ]
  }
  return m
}

function vorschau(m: MappingJson, werte: string[]) {
  return buildPreview(
    { columns: ['Titel'], rows: werte.map((Titel) => ({ Titel })) },
    m,
    { schema: testSchema }
  )
}

const WERTE = ['Der blaue Engel', '[Betriebsausflug]', 'M', '[ohne Titel]', 'Metropolis']

describe('Zweigbilanz', () => {
  it('weist die Aufteilung aus, wenn die Muster alles abdecken', () => {
    const c = vorschau(profil(HAUPT, ARCHIV), WERTE).checks
    const bilanz = c.find((x) => x.code === 'data.branchBalance')
    expect(bilanz).toBeDefined()
    expect(bilanz?.severity).toBe('info')
    expect(bilanz?.params?.ohne).toBe(0)
    // Gezaehlt wird ueber die Stichprobe der Vorschau, nicht ueber die ganze
    // Datei — dieselben Zeilen, aus denen auch die Beispiele stammen.
    expect(bilanz?.params?.zeilen).toBe(3)
    expect(String(bilanz?.params?.verteilung)).toContain('Haupttitel: 2')
    expect(String(bilanz?.params?.verteilung)).toContain('Archivtitel: 1')
  })

  it('beanstandet Zeilen, die durch alle Zweige fallen', () => {
    // Zwei Waechter, die dasselbe verlangen: Was keine Klammern hat, faellt
    // durch beide und steht hinterher nirgends.
    const c = vorschau(profil(ARCHIV, ARCHIV), WERTE).checks
    const luecke = c.find((x) => x.code === 'data.branchGap')
    expect(luecke?.severity).toBe('warning')
    expect(luecke?.params?.ohne).toBe(2)
    expect(luecke?.params?.zeilen).toBe(3)
  })

  it('erscheint nicht bei einer gewoehnlichen Verzweigung ohne Waechter', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = {
      pre: [],
      targets: [
        { target: 'work.title.primary', post: [] },
        { target: 'work.title.alternative', post: [] }
      ]
    }
    const codes = vorschau(m, WERTE).checks.map((x) => x.code)
    expect(codes).not.toContain('data.branchBalance')
    expect(codes).not.toContain('data.branchGap')
  })

  it('erscheint nicht bei nur einem Ziel', () => {
    const m = emptyMapping(['Titel'], '1.2.3')
    m.columns['Titel'] = { pre: [], targets: [{ target: 'work.title.primary', post: [HAUPT] as never }] }
    expect(vorschau(m, WERTE).checks.map((x) => x.code)).not.toContain('data.branchBalance')
  })
})

describe('Verdraengter Primaertitel', () => {
  const services = { schema: testSchema }

  function zweiOhneWaechter() {
    const m = emptyMapping(['A', 'B'], '1.2.3')
    m.columns['A'] = { pre: [], targets: [{ target: 'work.title.primary', post: [] }] }
    m.columns['B'] = { pre: [], targets: [{ target: 'work.title.supplied', post: [] }] }
    return m
  }

  it('meldet, was auf dem einwertigen Platz keinen Platz mehr fand', () => {
    const r = runRow(zweiOhneWaechter(), { A: 'Der blaue Engel', B: 'Betriebsausflug' }, 'z1', services)
    const codes = r.issues.map((i) => i.code)
    expect(codes).toContain('target.primaryTitleTaken')
    // Der erste gewinnt weiterhin — gemeldet wird die Entscheidung, nicht
    // rueckgaengig gemacht.
    expect((r.canonical.work['has_primary_title'] as { has_name: string }).has_name).toBe('Der blaue Engel')
  })

  it('schweigt, wenn beide Ziele denselben Wert liefern', () => {
    const r = runRow(zweiOhneWaechter(), { A: 'M', B: 'M' }, 'z2', services)
    expect(r.issues.map((i) => i.code)).not.toContain('target.primaryTitleTaken')
  })

  it('schweigt bei sauber gebauten Zweigen, weil nie zwei Werte ankommen', () => {
    const m = profil(HAUPT, ARCHIV)
    for (const wert of WERTE) {
      const r = runRow(m, { Titel: wert }, 'z', services)
      expect(r.issues.map((i) => i.code)).not.toContain('target.primaryTitleTaken')
    }
  })
})
