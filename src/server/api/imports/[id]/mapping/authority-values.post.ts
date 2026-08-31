/*
 * POST /api/imports/:id/mapping/authority-values — Wertevorrat der
 * Normdatenzuordnung, gerechnet auf der echten Datei des Imports.
 */
import { authorityValuesFor } from '../../../mappings/_run'
import { noStore } from '../../../mappings/_lib'
import { importSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { row, source } = await importSource(event)
  const body = (await readBody(event)) as { mapping?: unknown }
  const payload = await authorityValuesFor(source, body?.mapping)
  return { profile: { id: row.mapping_profile_id ?? 0, name: row.filename }, ...payload }
})
