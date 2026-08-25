/* Schemazugriff. */

import { describe, expect, it } from 'vitest'
import { createSchemaModel, EMPTY_SCHEMA_MODEL, getSchemaModel, setSchemaModel } from '../../server/lib/mapping/schema-model.js'
import { testSchema } from './fixtures.js'

describe('SchemaModel', () => {
  it('liest Enums und die Schemaversion', () => {
    expect(testSchema.version).toBe('1.2.3')
    expect(testSchema.enum('LanguageCodeEnum')).toEqual(['ger', 'eng', 'fre', 'zxx'])
    expect(testSchema.enum('GibtsNicht')).toEqual([])
    expect(Object.keys(testSchema.enums())).toContain('ColourTypeEnum')
    expect(testSchema.enumsSubset(['ColourTypeEnum'])).toEqual({ ColourTypeEnum: ['Colour', 'BlackAndWhite'] })
  })

  it('loest die erlaubten Resource-Typen einer Klasse auf', () => {
    expect(testSchema.sameAsTypes('Agent')).toEqual(['GNDResource', 'WikidataResource'])
    expect(testSchema.sameAsTypes('GeographicName')).toEqual(['GNDResource'])
    expect(testSchema.sameAsTypes('GibtsNicht')).toEqual([])
  })

  it('liefert Kategorie und Kennungsmuster', () => {
    expect(testSchema.resourceCategory('GNDResource')).toBe('avefi:GNDResource')
    expect(testSchema.resourceCategory('UnbekanntResource')).toBe('avefi:UnbekanntResource')
    expect(testSchema.resourceIdPattern('WikidataResource')).toBe('^Q\\d+$')
    expect(testSchema.resourceIdPattern('LocalResource')).toBeNull()
  })

  it('kommt ohne Schema aus, statt abzustuerzen', () => {
    const m = createSchemaModel('unbrauchbar')
    expect(m.enum('X')).toEqual([])
    expect(m.classExists('X')).toBe(false)
    expect(EMPTY_SCHEMA_MODEL.enums()).toEqual({})
  })

  it('merkt sich das einmal gesetzte Modell', () => {
    setSchemaModel(testSchema)
    expect(getSchemaModel().version).toBe('1.2.3')
    setSchemaModel(EMPTY_SCHEMA_MODEL)
  })
})
