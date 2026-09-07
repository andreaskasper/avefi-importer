/*
 * Zu jedem Code eine Uebersetzung, in beiden Sprachen.
 *
 * Der Mappingkern schickt seit dem 07.09.2026 Codes und Bausteine statt
 * fertiger Saetze. Das nuetzt nur, solange es zu jedem Code auch einen Satz
 * gibt: Fehlt einer, faellt die Oberflaeche auf den deutschen Servertext
 * zurueck — und in der englischen Oberflaeche steht wieder Deutsch. Genau
 * dieser Zustand war Stefans Befund, fuenf Codes ohne Uebersetzung.
 *
 * Ein Handgriff, an den man sich erinnern muss, ist kein Verfahren.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MELDUNGEN } from '../../server/lib/mapping/meldungen'

const wurzel = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Codes, die nicht ueber MELDUNGEN laufen, weil ihre Fundstelle den Satz
 * selbst baut — sie brauchen die Uebersetzung trotzdem.
 */
const WEITERE_CODES = [
  'authority.ambiguous', 'authority.limit', 'authority.unreachable', 'authority.unsupported',
  'export.foreign', 'export.unreadable', 'identifier.duplicate'
]

function checkMsg(sprache: string): Record<string, string> {
  const text = readFileSync(`${wurzel}i18n/locales/${sprache}/mapping.json`, 'utf8')
  return (JSON.parse(text) as { mapping: { checkMsg: Record<string, string> } }).mapping.checkMsg
}

describe('Meldungen des Mappingkerns', () => {
  const codes = [...Object.keys(MELDUNGEN), ...WEITERE_CODES]

  it.each(['de', 'en'])('hat zu jedem Code einen Satz in %s', (sprache) => {
    const saetze = checkMsg(sprache)
    const fehlend = codes.filter((c) => saetze[c.replace(/[.-]/g, '_')] === undefined)
    expect(fehlend).toEqual([])
  })

  it('nennt in beiden Sprachen dieselben Bausteine', () => {
    const de = checkMsg('de')
    const en = checkMsg('en')
    const bausteine = (t: string | undefined): string[] =>
      [...(t ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
    const abweichend = Object.keys(de)
      .filter((k) => en[k] !== undefined)
      .filter((k) => bausteine(de[k]).join(',') !== bausteine(en[k]).join(','))
    expect(abweichend).toEqual([])
  })
})
