/*
 * POST /api/mappings/:id/authority-values — Wertevorrat der Normdatenzuordnung.
 * Derselbe Code wie an einem Import.
 */
import { noStore } from '../_lib'
import { authorityValuesFor } from '../_run'
import { visibleProfileSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { profile, source } = await visibleProfileSource(event)
  const body = (await readBody(event)) as { mapping?: unknown }
  const payload = await authorityValuesFor(source, body?.mapping ?? profile.mapping_json)
  return { profile: { id: profile.id, name: profile.name }, ...payload }
})
