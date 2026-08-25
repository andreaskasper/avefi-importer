/* Gemeinsame Testdaten fuer den Mappingkern. */

import type { MappingJson, TransformStep } from '#shared/types/domain'
import { createSchemaModel } from '../../server/lib/mapping/schema-model.js'
import { emptyMapping } from '../../server/lib/mapping/profile.js'

/**
 * Ein kleines Schema mit genau dem, was die Tests brauchen. Das echte
 * model.schema.json liegt unter public/schema/avefi/ und wird zur Laufzeit
 * hereingereicht — die Tests sollen davon nicht abhaengen.
 */
export const testSchema = createSchemaModel({
  version: '1.2.3',
  $defs: {
    LanguageCodeEnum: { enum: ['ger', 'eng', 'fre', 'zxx'] },
    WorkVariantTypeEnum: { enum: ['Monographic', 'Serial'] },
    ColourTypeEnum: { enum: ['Colour', 'BlackAndWhite'] },
    GNDResource: {
      properties: {
        category: { enum: ['avefi:GNDResource'] },
        id: { pattern: '^[-\\dX]+$' }
      }
    },
    LocalResource: {
      properties: { category: { enum: ['avefi:LocalResource'] } }
    },
    WikidataResource: {
      properties: {
        category: { enum: ['avefi:WikidataResource'] },
        id: { pattern: '^Q\\d+$' }
      }
    },
    Agent: {
      properties: {
        same_as: { items: { anyOf: [{ $ref: '#/$defs/GNDResource' }, { $ref: '#/$defs/WikidataResource' }] } }
      }
    },
    GeographicName: {
      properties: { same_as: { items: { anyOf: [{ $ref: '#/$defs/GNDResource' }] } } }
    },
    Subject: {
      properties: { same_as: { items: { anyOf: [{ $ref: '#/$defs/GNDResource' }] } } }
    }
  }
})

/** Bequemer Bauer fuer Schritte, deren Operation nicht im Typunion steht. */
export function step(o: Record<string, unknown>): TransformStep {
  return o as unknown as TransformStep
}

/** Ein kleines, vollstaendiges Profil ueber vier Spalten. */
export function demoMapping(): MappingJson {
  const m = emptyMapping(['Titel', 'Regie', 'Jahr', 'Laufzeit', 'Notiz'], '1.2.3')
  m.columns['Titel'] = { pre: [{ op: 'trim' }], targets: [{ target: 'work.title.primary', post: [] }] }
  m.columns['Regie'] = {
    pre: [{ op: 'trim' }, { op: 'split', sep: ';' }],
    targets: [{ target: 'work.activity.directing', post: [] }]
  }
  m.columns['Jahr'] = { pre: [], targets: [{ target: 'work.production.date', post: [{ op: 'date' }] }] }
  m.columns['Laufzeit'] = {
    pre: [],
    targets: [{ target: 'item.duration', post: [{ op: 'duration', unit: 'minutes' }] }]
  }
  m.columns['Notiz'] = { ignore: true }
  return m
}

export const demoRows = [
  { Titel: '  Die Wilden Kerle ', Regie: 'Joachim Masannek; Anna Mueller', Jahr: '12.05.2003', Laufzeit: '95', Notiz: 'x' },
  { Titel: 'Die Wilden Kerle', Regie: 'Joachim Masannek', Jahr: '2003', Laufzeit: '1:35:00', Notiz: '' },
  { Titel: 'Ein anderer Film', Regie: '', Jahr: '', Laufzeit: '', Notiz: '' }
]
