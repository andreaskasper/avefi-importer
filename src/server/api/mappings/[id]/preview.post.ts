/*
 * POST /api/mappings/:id/preview — Vorschau des Entwurfs auf der Stichprobe.
 * Derselbe Code wie an einem Import und wie bei der spaeteren Konvertierung.
 */
import { noStore } from '../_lib'
import { previewFor } from '../_run'
import { ownProfileSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { source } = await ownProfileSource(event)
  const body = (await readBody(event)) as { mapping?: unknown }
  return previewFor(source, body?.mapping)
})
