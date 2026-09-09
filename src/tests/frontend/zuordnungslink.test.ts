/*
 * Der Weg zur Zuordnung haengt am Format, nicht am gespeicherten Profil.
 *
 * Am 09.09.2026 meldete Jasper Stratil, dass "Zuordnung ansehen" im Menue der
 * Importe-Seite fehlt. Der Import war konvertiert, die Seite gab es, der
 * Menuepunkt war nur verborgen: Die Bedingung fragte `hasMapping`, also ob
 * `imports.mapping_profile_id` gesetzt ist.
 *
 * Diese Spalte beantwortet die Frage nicht. Sie ist leer, wenn ueber ein
 * Formatprofil konvertiert wurde (MARC-XML, AVefi nativ), und sie ist gefuellt,
 * wenn im Editor gespeichert wurde, ohne zu konvertieren. Auf der Demo-Instanz
 * betraf das neun fertig konvertierte Importe.
 *
 * Was wirklich zaehlt, steht in server/api/imports/[id]/mapping/_source.ts: Bei
 * einem nicht-tabellarischen Format antwortet die Seite mit 409 `not_tabular`.
 * Also `tabular`.
 *
 * Der Test prueft die Bedingung an der Quelle, weil der Fehler nicht
 * fehlschlug — es fehlte nur etwas, und das sieht niemand, der nicht danach
 * sucht.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const wurzel = fileURLToPath(new URL('../..', import.meta.url))
const lies = (pfad: string): string => readFileSync(join(wurzel, pfad), 'utf8')

/** Dateien, die auf die Zuordnungsseite verlinken. */
const VERLINKENDE = [
  'app/components/imports/RowMenu.vue',
  'app/pages/imports/[id]/index.vue',
  'app/pages/imports/[id]/report.vue',
  'app/components/imports/ImportTable.vue'
]

describe('Verweis auf die Zuordnungsseite', () => {
  it('nutzt nirgends mehr hasMapping als Bedingung', () => {
    for (const datei of VERLINKENDE) {
      const inhalt = lies(datei)
      // Der Name darf im Fliesstext eines Kommentars stehen, nicht aber als
      // Feldzugriff in einer Bedingung oder Zuweisung.
      const treffer = inhalt.match(/\b(?:item|props)\.hasMapping\b|:has-mapping=/g)
      expect(treffer, `${datei} entscheidet noch ueber hasMapping`).toBeNull()
    }
  })

  it('schaltet den Menuepunkt ueber das Format', () => {
    const inhalt = lies('app/components/imports/RowMenu.vue')
    expect(inhalt).toContain('v-if="item.tabular"')
    expect(inhalt).toContain('/mapping`')
  })

  it('beschriftet den Menuepunkt nach dem Zustand', () => {
    const inhalt = lies('app/components/imports/RowMenu.vue')
    // "Zuordnen" solange es noch nichts anzusehen gibt, sonst "Zuordnung ansehen".
    expect(inhalt).toContain("'imports.menu.map'")
    expect(inhalt).toContain("'imports.menu.mapping'")
    expect(inhalt).toContain("awaiting_format_review")
  })

  it('doppelt den Knopf auf der Detailseite nicht', () => {
    const inhalt = lies('app/pages/imports/[id]/index.vue')
    // Oben steht schon ein "Zuordnen" fuer genau diesen Zustand.
    expect(inhalt).toContain("item.tabular && item.status !== 'awaiting_format_review'")
  })

  it('kennt beide Beschriftungen in beiden Sprachen', () => {
    for (const sprache of ['de', 'en']) {
      const katalog = JSON.parse(lies(`i18n/locales/${sprache}/imports.json`))
      expect(katalog.imports.menu.map, `${sprache}: imports.menu.map fehlt`).toBeTruthy()
      expect(katalog.imports.menu.mapping, `${sprache}: imports.menu.mapping fehlt`).toBeTruthy()
    }
  })

  it('liefert hasMapping nicht mehr aus', () => {
    const inhalt = lies('server/api/imports/index.get.ts')
    expect(/hasMapping:/.test(inhalt), 'hasMapping steht wieder in der Nutzlast').toBe(false)
  })
})
