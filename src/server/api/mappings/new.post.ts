/*
 * POST /api/mappings/new?name=<Dateiname> — Profil aus einer Beispieldatei anlegen.
 *
 * Damit laesst sich ein Profil ohne Import bauen: Wer die Zuordnung vorbereiten
 * will, braucht dafuer keine Lieferung anzulegen.
 *
 * Ist die Kopfzeile schon bekannt, entsteht kein zweites Profil. Stattdessen
 * wird die Stichprobe aufgefrischt und auf das vorhandene Profil verwiesen —
 * zwei Profile fuer dieselbe Kopfzeile waeren nur eine Fehlerquelle.
 */
import { db } from '../../db'
import { buildProfileSample, emptyMapping, suggestProfileName } from '../../lib/mapping/index'
import {
  avefiSchemaVersion, createProfile, findOwnProfile, institutionName, noStore, requireInstitution,
  setProfileSample
} from './_lib'
import { readUploadedTable } from './_upload'

export default defineEventHandler(async (event) => {
  noStore(event)
  const user = await requireInstitution(event)
  const sql = db()

  const upload = await readUploadedTable(event)
  const sample = buildProfileSample(upload.source.columns, upload.source.rows, {
    totalRows: upload.source.rowCount
  })

  const existing = await findOwnProfile(sql, user.institution_id, upload.source.headerHash)
  if (existing !== null) {
    await setProfileSample(sql, existing.id, sample)
    return {
      profile: { id: existing.id, name: existing.name, version: existing.version, complete: existing.complete },
      created: false,
      columns: upload.source.columns.length,
      rows: upload.source.rowCount,
      sheet: upload.sheet
    }
  }

  const profile = await createProfile(sql, {
    institutionId: user.institution_id,
    userId: user.id,
    headerHash: upload.source.headerHash,
    baseFormat: upload.baseFormat,
    name: suggestProfileName(await institutionName(sql, user.institution_id), upload.filename),
    mapping: emptyMapping(upload.source.columns, await avefiSchemaVersion()),
    sample
  })

  return {
    profile: { id: profile.id, name: profile.name, version: profile.version, complete: profile.complete },
    created: true,
    columns: upload.source.columns.length,
    rows: upload.source.rowCount,
    sheet: upload.sheet
  }
})
