/*
 * POST /api/records/validate — Live-Pruefung eines Datensatzes im Editor.
 *
 * Geprueft wird beim Dienst efi-conv, also mit demselben Validator, der auch
 * beim Konvertieren laeuft. Eine im Browser nachgebaute Pruefung waere eine
 * zweite Wahrheit: Vorschau und echte Konvertierung wuerden verschiedenen Code
 * ausfuehren und frueher oder spaeter Verschiedenes sagen.
 *
 * Drei Arten von Rueckmeldung, bewusst getrennt gehalten:
 *   issues        Beanstandungen des Schemas (Dienst) plus die Regel
 *                 „Kennung gehoert nicht ins Namensfeld"
 *   hints         Empfehlungen zur Vollstaendigkeit — keine Fehler
 *   unavailable   der Dienst war nicht erreichbar; dann ist nichts geprueft,
 *                 und das darf nicht wie „keine Beanstandung" aussehen
 */
import { z } from 'zod'
import { completeness, completenessIssues } from '../../lib/mapping/index'
import { checkRecords } from '../../worker/validate'
import { requireUser } from '../../utils/session'
import { fail, noStore } from '../imports/_lib'
import { authorityInNameIssues } from './_record'

const Node = z.record(z.string(), z.unknown())

const Body = z.object({
  work: Node,
  manifestations: z.array(Node).default([]),
  items: z.array(Node).default([])
})

export default defineEventHandler(async (event) => {
  noStore(event)
  await requireUser(event)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'record_malformed', {}, 'Datensatz nicht lesbar.')
  const record = {
    work: parsed.data.work as never,
    manifestations: parsed.data.manifestations as never[],
    items: parsed.data.items as never[]
  }

  const nodes: Record<string, unknown>[] = [
    ...(Object.keys(parsed.data.work).length > 0 ? [parsed.data.work] : []),
    ...parsed.data.manifestations,
    ...parsed.data.items
  ]

  const result = await checkRecords(nodes, {}, 20_000)

  return {
    checked: result.checked,
    valid: result.valid,
    issues: [...result.issues, ...authorityInNameIssues(record)],
    schema: result.schema ?? null,
    unavailable: result.unavailable,
    completeness: completeness(record),
    hints: completenessIssues(record)
  }
})
