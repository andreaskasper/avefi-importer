/*
 * GET /api/mappings/:id/export — Profil als JSON herunterladen.
 *
 * Die Stichprobe MUSS mit. Im PHP-Stand fehlte sie in aelteren Exporten,
 * dadurch verweigerte der Editor beim Wiedereinlesen den Dienst — und die
 * Meldung verschwieg den Grund. Fehlt sie hier, steht das ausdruecklich im
 * Dokument, samt Hinweis auf den Ausweg.
 */
import { db } from '../../../db'
import { buildProfileExport, normalizeMapping } from '../../../lib/mapping/index'
import { avefiSchemaVersion, institutionName, noStore, visibleProfile } from '../_lib'

/** Dateiname ohne Zeichen, die ein Dateisystem oder ein Kopfzeilenfeld stoeren. */
function slug(name: string): string {
  const out = name.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return out === '' ? 'profil' : out.slice(0, 80)
}

export default defineEventHandler(async (event) => {
  noStore(event)
  const { profile } = await visibleProfile(event)
  const sql = db()

  const { mapping } = normalizeMapping(profile.mapping_json, { avefiSchemaVersion: await avefiSchemaVersion() })
  const document = buildProfileExport(mapping, profile.sample_json, {
    profileName: profile.name,
    profileVersion: profile.version,
    baseFormat: profile.base_format,
    headerHash: profile.header_hash,
    institution: (await institutionName(sql, profile.institution_id)) ?? undefined
  })

  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="mapping-${slug(profile.name)}.json"`)
  return JSON.stringify(document, null, 2)
})
