/*
 * GET /api/records/authority/search?kind=&q=&sources= — Normdaten-Kandidaten.
 *
 * Angereichert wird nie automatisch: Der Endpunkt liefert Kandidaten, die
 * Auswahl trifft ein Mensch. Was genau ein exakter Treffer je Quelle ist, steht
 * in "exact" — mehrere exakte Treffer heissen ausdruecklich "nichts uebernehmen".
 * Kein Treffer ist besser als ein falscher.
 */
import { authorityCandidates, sourcesForKind, isAuthoritySource } from '../../../lib/authority/index'
import { requireUser } from '../../../utils/session'
import { fail, noStore } from '../../imports/_lib'
import { schemaModel } from '../_schema'

export default defineEventHandler(async (event) => {
  noStore(event)
  await requireUser(event)

  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  const kind = String(query.kind ?? 'subject').trim()
  if (q.length < 2) return { results: [], warnings: [], truncated: false }

  const schema = await schemaModel()
  const allowed = sourcesForKind(kind, schema)
  const wished = String(query.sources ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== '')
  const sources = wished.length > 0
    ? wished.filter((s) => isAuthoritySource(s) && allowed.includes(s))
    : allowed

  if (sources.length === 0) {
    throw fail(400, 'authority_no_source', { kind }, 'Fuer diese Art gibt es keine erlaubte Normdatenquelle.')
  }

  const warnings: string[] = []
  const results = await authorityCandidates(q, kind, {
    schema,
    sources: sources as never,
    onWarn: (m) => warnings.push(m)
  })

  return {
    results: results.map((r) => ({
      source: r.source,
      id: r.id,
      label: r.label,
      description: r.description,
      agentType: r.agentType,
      resourceType: r.resourceType,
      category: schema.resourceCategory(r.resourceType),
      uri: r.uri,
      exact: r.exact
    })),
    // Faellt eine Quelle aus, sagt die Oberflaeche welche — statt so zu tun,
    // als haette es dort nichts gegeben.
    warnings,
    sources
  }
})
