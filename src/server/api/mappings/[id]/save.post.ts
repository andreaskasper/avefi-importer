/*
 * POST /api/mappings/:id/save — Entwurf als neue Fassung speichern.
 *
 * Die alte Fassung bleibt im Verlauf. Bestehende Importe werden NICHT
 * nachgezogen: Sie merken sich Profil und Fassung, mit der sie entstanden sind.
 * Ein stilles Nachkonvertieren wuerde geprueftes Material veraendern.
 */
import { db } from '../../../db'
import { noStore, setProfileSample, updateProfile } from '../_lib'
import { prepareSave } from '../_run'
import { ownProfileSource } from './_source'

export default defineEventHandler(async (event) => {
  noStore(event)
  const { user, profile, source } = await ownProfileSource(event)
  const sql = db()

  const body = (await readBody(event)) as { mapping?: unknown; name?: unknown }
  const prepared = await prepareSave(source, body?.mapping)
  const name = String(body?.name ?? '').trim()

  const updated = await updateProfile(sql, profile, prepared.mapping, name === '' ? null : name, user.id)
  // Die Stichprobe bleibt, wie sie ist: Sie stammt aus der Datei, nicht aus dem
  // Entwurf. Neu geschrieben wird sie nur, wenn eine Datei nachgereicht wurde.
  if (profile.sample_json === null) await setProfileSample(sql, updated.id, prepared.sample)

  return {
    started: false,
    profile: { id: updated.id, name: updated.name, version: updated.version, complete: updated.complete },
    checks: prepared.checks,
    complete: prepared.complete,
    open: prepared.open
  }
})
