/*
 * POST /api/imports/:id/mapping/preview — Vorschau des Entwurfs.
 *
 * Der Editor schickt den Entwurf und zeigt, was zurueckkommt. Er rechnet nichts
 * nach: Vorschau und Konvertierung laufen durch denselben Code.
 */
import { previewFor } from '../../../mappings/_run'
import { noStore } from '../../../mappings/_lib'
import { importSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { source } = await importSource(event)
  const body = (await readBody(event)) as { mapping?: unknown }
  return previewFor(source, body?.mapping)
})
