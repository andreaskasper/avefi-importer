/*
 * POST /api/imports/:id/mapping/adopt — ein fremdes Profil uebernehmen.
 *
 * Uebernommen wird als KOPIE, nicht als Verweis. Zeigte der Import auf das
 * fremde Profil, veraenderte jede Aenderung dort fremde Importe.
 *
 * Spalten, die es hier nicht gibt, fallen weg; hiesige Spalten ohne
 * Entsprechung bleiben im dritten Zustand und muessen beantwortet werden.
 */
import { db } from '../../../../db'
import { adoptMapping, normalizeMapping } from '../../../../lib/mapping/index'
import { avefiSchemaVersion, fail, findProfile, noStore } from '../../../mappings/_lib'
import { importSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { user, source } = await importSource(event)

  const body = (await readBody(event)) as { profile_id?: unknown }
  const id = Number(body?.profile_id ?? 0)
  if (!Number.isInteger(id) || id <= 0) throw fail(400, 'no_profile', {}, 'Kein Profil angegeben.')

  const foreign = await findProfile(db(), id)
  if (foreign === null) throw fail(404, 'profile_not_found', {}, 'Profil nicht gefunden.')

  const version = await avefiSchemaVersion()
  const { mapping } = normalizeMapping(foreign.mapping_json, { avefiSchemaVersion: version })
  const result = adoptMapping(mapping, source.columns, version)

  return {
    mapping: result.mapping,
    matched: result.matched,
    missing: result.missing,
    extra: result.extra,
    from: {
      id: foreign.id,
      name: foreign.name,
      own: foreign.institution_id === user.institution_id
    }
  }
})
