/*
 * GET /api/mappings — alle Mappingprofile.
 *
 * Profile sind bewusst global sichtbar, eigene zuerst. Dieselbe Kopfzeile
 * taucht in mehreren Haeusern auf; wer schon zugeordnet hat, soll nicht wieder
 * bei null anfangen. Geaendert werden darf nur das eigene Profil.
 */
import { db } from '../../db'
import { listProfiles, requireInstitution } from './_lib'

export default defineEventHandler(async (event) => {
  const user = await requireInstitution(event)
  const profiles = await listProfiles(db(), user.institution_id)
  return {
    profiles,
    own: profiles.filter((p) => p.own).length,
    institutionId: user.institution_id
  }
})
