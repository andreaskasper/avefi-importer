/*
 * POST /api/imports/:id/mapping/schema — den Entwurf gegen das AVefi-Schema pruefen.
 *
 * Bewusst ein eigener Aufruf: Geprueft wird im Dienst efi-conv, und der ist zu
 * langsam, um an jedem Tastendruck zu haengen. Der Editor fragt auf Wunsch und
 * nach dem Speichern.
 */
import { schemaCheck } from '../../../mappings/_run'
import { noStore } from '../../../mappings/_lib'
import { importSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { source } = await importSource(event)
  const body = (await readBody(event)) as { mapping?: unknown }
  return schemaCheck(source, body?.mapping)
})
