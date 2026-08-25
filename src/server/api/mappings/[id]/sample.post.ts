/*
 * POST /api/mappings/:id/sample?name=<Dateiname> — Beispieldaten nachreichen.
 *
 * Der Weg fuer Profile aus einem Export ohne Stichprobe. Die Kopfzeile muss zum
 * Profil passen, sonst zeigte die Zuordnung auf Spalten, die es nicht gibt;
 * passt sie nicht, sagt die Antwort, welche Spalten fehlen und welche neu sind.
 */
import { db } from '../../../db'
import { buildProfileSample, checkProfileColumns, normalizeMapping } from '../../../lib/mapping/index'
import { avefiSchemaVersion, fail, noStore, ownProfile, setProfileSample } from '../_lib'
import { readUploadedTable } from '../_upload'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { profile } = await ownProfile(event)
  const upload = await readUploadedTable(event)

  if (upload.source.headerHash !== profile.header_hash) {
    const version = await avefiSchemaVersion()
    const { mapping } = normalizeMapping(profile.mapping_json, { avefiSchemaVersion: version })
    const report = checkProfileColumns(mapping, upload.source.columns)
    throw fail(409, 'hash_mismatch', {
      missing: report.missing,
      extra: report.extra,
      renamed: report.renamed,
      matched: report.matched.length,
      summary: report.summary
    }, 'Die Kopfzeile passt nicht zu diesem Profil.')
  }

  const sample = buildProfileSample(upload.source.columns, upload.source.rows, {
    totalRows: upload.source.rowCount
  })
  await setProfileSample(db(), profile.id, sample)

  return {
    profile: { id: profile.id, name: profile.name, version: profile.version, complete: profile.complete },
    columns: upload.source.columns.length,
    rows: upload.source.rowCount,
    sheet: upload.sheet
  }
})
