/*
 * GET /api/records/authority/detail?source=&id= — Einzelheiten zu einem Treffer.
 *
 * Damit sich eine Zuordnung pruefen laesst, bevor sie bestaetigt wird. Der
 * Dienst liefert im Fehlerfall den leeren Datensatz statt einer Ausnahme; ob
 * etwas gefunden wurde, steht in "found".
 */
import { authorityDetail, isAuthoritySource } from '../../../lib/authority/index'
import { requireUser } from '../../../utils/session'
import { fail, noStore } from '../../imports/_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  await requireUser(event)

  const query = getQuery(event)
  const source = String(query.source ?? '').trim().toLowerCase()
  const id = String(query.id ?? '').trim()

  if (!isAuthoritySource(source)) throw fail(400, 'authority_source_unknown', { source }, 'Unbekannte Quelle.')
  if (id === '') throw fail(400, 'authority_id_missing', {}, 'Keine Kennung angegeben.')

  const warnings: string[] = []
  const detail = await authorityDetail(source, id, { onWarn: (m) => warnings.push(m) })
  const found = detail.title !== id || detail.description !== '' || detail.extract !== ''

  return { detail, found, warnings }
})
