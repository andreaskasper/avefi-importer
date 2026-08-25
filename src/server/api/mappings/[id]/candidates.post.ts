/* POST /api/mappings/:id/candidates — Normdaten-Kandidaten zu einem Wert. */
import { noStore } from '../_lib'
import { candidatesFor } from '../_run'
import { ownProfileSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  await ownProfileSource(event)
  return candidatesFor(await readBody(event))
})
