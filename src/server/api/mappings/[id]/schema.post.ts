/* POST /api/mappings/:id/schema — Entwurf gegen das AVefi-Schema pruefen (efi-conv). */
import { noStore } from '../_lib'
import { schemaCheck } from '../_run'
import { ownProfileSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { source } = await ownProfileSource(event)
  const body = (await readBody(event)) as { mapping?: unknown }
  return schemaCheck(source, body?.mapping)
})
