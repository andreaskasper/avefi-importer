/*
 * POST /api/mappings — ein exportiertes Profil einlesen.
 *
 * Gelesen wird die Exportdatei aus diesem Importer. Fremde Dokumente werden
 * versuchsweise gelesen und dabei ausdruecklich als fremd gemeldet.
 *
 * Fehlt die Stichprobe, entsteht das Profil trotzdem — aber die Antwort sagt
 * genau, was fehlt und wie es zu beheben ist: eine passende Tabelle nachreichen.
 * Im PHP-Stand verweigerte der Editor an dieser Stelle den Dienst, ohne den
 * Grund zu nennen.
 */
import type { BaseFormat } from '#shared/types/domain'
import { db } from '../../db'
import { readProfileExport } from '../../lib/mapping/index'
import {
  avefiSchemaVersion, createProfile, fail, findOwnProfile, noStore, requireInstitution,
  setProfileSample, sourceFromSample, updateProfile
} from './_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  const user = await requireInstitution(event)
  const sql = db()

  const body = (await readBody(event)) as { profile?: unknown } | unknown
  const document = (body as { profile?: unknown })?.profile ?? body
  const version = await avefiSchemaVersion()
  const read = readProfileExport(document, { avefiSchemaVersion: version })

  if (read.export === null) {
    throw fail(422, 'export_unreadable', { issues: read.issues }, 'Die Datei enthaelt kein Profil.')
  }
  const headerHash = read.export.headerHash
  if (headerHash === '') {
    throw fail(422, 'export_no_hash', { issues: read.issues }, 'Dem Profil fehlt der Kopfzeilen-Hash.')
  }

  const sample = read.export.sample
  const usable = sourceFromSample(sample, headerHash, read.export.baseFormat) !== null
  const baseFormat = (read.export.baseFormat ?? 'csv') as BaseFormat

  const existing = await findOwnProfile(sql, user.institution_id, headerHash)
  if (existing !== null) {
    const updated = await updateProfile(
      sql, existing, read.export.mapping, read.export.origin.profileName, user.id
    )
    if (sample !== null) await setProfileSample(sql, updated.id, sample)
    return {
      profile: { id: updated.id, name: updated.name, version: updated.version, complete: updated.complete },
      created: false,
      hasSample: usable || existing.sample_json !== null,
      issues: read.issues
    }
  }

  const profile = await createProfile(sql, {
    institutionId: user.institution_id,
    userId: user.id,
    headerHash,
    baseFormat,
    name: read.export.origin.profileName,
    mapping: read.export.mapping,
    sample
  })

  return {
    profile: { id: profile.id, name: profile.name, version: profile.version, complete: profile.complete },
    created: true,
    hasSample: usable,
    issues: read.issues
  }
})
