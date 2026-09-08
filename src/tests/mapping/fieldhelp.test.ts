/*
 * Feldauskunft am Befund (#3).
 *
 * Zwei Dinge sind hier wichtiger als der Rest: dass die Werteliste ankommt und
 * dass ein Befund ohne aufloesbares Ziel stillschweigend uebergangen wird.
 * Beides ist beim Bauen schiefgegangen — die Werteliste fiel weg, weil das
 * Schemamodell leer hereingereicht wurde, und der Rueckgabewert sah trotzdem
 * plausibel aus.
 */
import { describe, expect, it } from 'vitest'
import type { ValidationIssue } from '../../shared/types/domain.js'
import { fieldHelpFor } from '../../server/lib/fieldhelp.js'
import { createSchemaModel } from '../../server/lib/mapping/schema-model.js'

const schema = createSchemaModel({
  $defs: {
    FormatOpticalTypeEnum: { enum: ['BluRay', 'CD', 'DVD', 'LaserDisc'] },
    ColourTypeEnum: { enum: ['Colour', 'BlackAndWhite'] }
  }
})

function befund(over: Partial<ValidationIssue>): ValidationIssue {
  return { severity: 'warning', message: 'x', ...over }
}

describe('fieldHelpFor', () => {
  it('nennt die zulaessigen Werte eines Wertelistenfeldes', () => {
    const hilfe = fieldHelpFor([befund({ targetField: 'item.format.optical' })], schema)
    expect(hilfe['item.format.optical']?.values).toEqual(['BluRay', 'CD', 'DVD', 'LaserDisc'])
    expect(hilfe['item.format.optical']?.label).toBeTruthy()
  })

  it('laesst die Werteliste weg, wo das Feld keine hat', () => {
    const hilfe = fieldHelpFor([befund({ targetField: 'work.title.primary' })], schema)
    expect(hilfe['work.title.primary']).toBeDefined()
    expect(hilfe['work.title.primary']?.values).toBeNull()
  })

  it('uebergeht Schemaslots, die keine Zielschluessel sind', () => {
    // has_identifier kommt so aus der Schemapruefung. Es ist kein Ziel des
    // Katalogs; der Hinweis dazu haengt am Code, nicht am Feld.
    expect(fieldHelpFor([befund({ targetField: 'has_identifier' })], schema)).toEqual({})
  })

  it('gibt zu Befunden ohne Zielfeld nichts zurueck', () => {
    expect(fieldHelpFor([befund({}), befund({ targetField: '' })], schema)).toEqual({})
  })

  it('nennt jedes Feld nur einmal, gleich wie viele Befunde es hat', () => {
    const viele = Array.from({ length: 40 }, () => befund({ targetField: 'item.format.optical' }))
    expect(Object.keys(fieldHelpFor(viele, schema))).toEqual(['item.format.optical'])
  })

  it('liefert ohne Schema keine erfundene Werteliste', () => {
    // Der Fehler, der diesen Test veranlasst hat: Mit getSchemaModel() statt
    // loadSchemaModel() kam im frischen Prozess ein leeres Modell an. Die
    // Auskunft erschien trotzdem — nur ohne den Teil, auf den es ankam.
    const leer = createSchemaModel({})
    const hilfe = fieldHelpFor([befund({ targetField: 'item.format.optical' })], leer)
    expect(hilfe['item.format.optical']?.values).toBeNull()
  })
})
