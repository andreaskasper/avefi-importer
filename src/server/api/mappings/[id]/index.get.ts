/*
 * GET /api/mappings/:id — ein Profil mit Verlauf.
 *
 * Sichtbar ist jedes Profil; ob es geaendert werden darf, sagt "own". Ob es
 * bearbeitet werden KANN, sagt "hasSample" — ohne Stichprobe rechnet der Editor
 * keine Vorschau, und das ist der haeufigste Grund, warum jemand hier strandet.
 */
import { db } from '../../../db'
import { columnState, getTarget } from '../../../lib/mapping/index'
import { editorTargets, noStore, openColumnsOf, profileVersions, visibleProfile } from '../_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { user, profile } = await visibleProfile(event)
  const sql = db()

  const [versions, catalog] = await Promise.all([profileVersions(sql, profile.id), editorTargets()])

  const used = new Set<string>()
  const columns = Object.entries(profile.mapping_json?.columns ?? {}).map(([name, spec]) => {
    const targets = (spec?.targets ?? []).map((t) => String(t.target ?? ''))
    for (const t of targets) used.add(t)
    const ops = [
      ...(spec?.pre ?? []).map((s) => String(s.op)),
      ...(spec?.targets ?? []).flatMap((t) => (t.post ?? []).map((s) => String(s.op)))
    ]
    return { name, state: columnState(spec), targets, ops }
  })
  for (const d of profile.mapping_json?.defaults ?? []) used.add(String(d.target ?? ''))

  const targets: Record<string, { label: string; path: string; schemaPath: string }> = {}
  for (const key of used) {
    const entry = catalog.find((t) => t.key === key)
    if (entry !== undefined) targets[key] = { label: entry.label, path: entry.path, schemaPath: entry.schemaPath }
    else if (getTarget(key) === undefined) targets[key] = { label: key, path: key, schemaPath: '' }
  }

  const rows = await sql<Array<{ name: string; use_count: string }>>`
    SELECT i.name,
           (SELECT COUNT(*) FROM imports im WHERE im.mapping_profile_id = ${profile.id}) AS use_count
      FROM institutions i WHERE i.id = ${profile.institution_id}`

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      base_format: profile.base_format,
      header_hash: profile.header_hash,
      version: profile.version,
      complete: profile.complete,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      institution_id: profile.institution_id,
      institution_name: rows[0]?.name ?? '',
      avefiSchemaVersion: profile.mapping_json?.avefiSchemaVersion ?? null,
      profileFormatVersion: profile.mapping_json?.profileFormatVersion ?? null
    },
    own: profile.institution_id === user.institution_id,
    hasSample: profile.sample_json !== null,
    useCount: Number(rows[0]?.use_count ?? 0),
    columns,
    open: openColumnsOf(profile.mapping_json),
    defaults: profile.mapping_json?.defaults ?? [],
    grouping: profile.mapping_json?.grouping?.work?.by ?? [],
    targets,
    versions
  }
})
