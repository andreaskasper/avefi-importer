/*
 * POST /api/imports/:id/mapping/candidates — Normdaten-Kandidaten zu einem Wert.
 *
 * Grundlage der bestaetigten Zuordnung. Geliefert werden auch die nicht
 * eindeutigen Treffer, damit sichtbar ist, was die Automatik aus Vorsicht
 * verworfen haette.
 */
import { candidatesFor } from '../../../mappings/_run'
import { noStore } from '../../../mappings/_lib'
import { importSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  await importSource(event)
  return candidatesFor(await readBody(event))
})
