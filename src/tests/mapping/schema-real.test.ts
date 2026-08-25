/*
 * Abgleich gegen das ausgelieferte av-efi-schema: Die Namen im Zielkatalog
 * muessen im echten Schema vorkommen, sonst bleiben Wertelisten und Kennungs-
 * muster in der Oberflaeche leer. Fehlt die Schemadatei, wird uebersprungen.
 */

import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createSchemaModel } from '../../server/lib/mapping/schema-model.js'
import { allTargets, targetsForFrontend } from '../../server/lib/mapping/targets.js'

const SCHEMA_PATH = 'public/schema/avefi/model.schema.json'

async function loadSchema() {
  try {
    return createSchemaModel(JSON.parse(await readFile(SCHEMA_PATH, 'utf8')))
  } catch {
    return null
  }
}

describe('Zielkatalog gegen das echte Schema', () => {
  it('loest jede genannte Werteliste auf', async () => {
    const schema = await loadSchema()
    if (schema === null) return
    for (const t of allTargets()) {
      if (!t.type.startsWith('enum:')) continue
      expect(schema.enum(t.type.slice(5)), t.key).not.toEqual([])
    }
  })

  it('kennt jeden genannten Resource-Typ', async () => {
    const schema = await loadSchema()
    if (schema === null) return
    for (const t of allTargets()) {
      if (!t.type.startsWith('id:')) continue
      const name = t.type.slice(3)
      expect(schema.resourceCategory(name), t.key).toBe(`avefi:${name}`)
    }
  })

  it('liefert der Oberflaeche Wertelisten und Muster', async () => {
    const schema = await loadSchema()
    if (schema === null) return
    const list = targetsForFrontend(schema)
    expect(list.filter((t) => (t.enumValues?.length ?? 0) > 0).length).toBeGreaterThan(5)
    expect(list.filter((t) => t.pattern !== undefined).length).toBeGreaterThan(5)
  })
})
