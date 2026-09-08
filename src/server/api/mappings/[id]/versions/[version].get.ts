/*
 * GET /api/mappings/:id/versions/:version — eine gespeicherte Profilversion ansehen.
 *
 * Bis zum 08.09.2026 liessen sich alte Versionen nur zuruecksetzen, nicht
 * ansehen: Die Versionsliste am Profil bot ausschliesslich "Zuruecksetzen" an.
 * Man setzte also auf einen Stand zurueck, den man nicht kannte.
 *
 * Denselben Mangel meldete Jasper Stratil von der anderen Seite (#6):
 * "Zuordnung ansehen" an einem Import zeigt das Profil in seiner heutigen
 * Version, nicht in der, mit der die Datei konvertiert wurde. Wer nachvollziehen
 * will, wie ein Ergebnis zustande kam, bekommt eine Antwort auf eine andere
 * Frage.
 *
 * Beides braucht dieselbe Sache: eine Ansicht auf eine bestimmte Version.
 *
 * Bewusst nur lesend, und bewusst nicht der Editor. Eine alte Version dort zu
 * laden waere eine Falle — ein Klick auf Speichern schriebe den alten Stand als
 * neuen fort und drehte das Profil unbemerkt zurueck. Wer das will, nimmt
 * "Zuruecksetzen"; dann steht es auch so im Verlauf.
 */
import { db } from '../../../../db'
import { editorTargets, noStore, versionMapping, visibleProfile } from '../../_lib'
import { fail } from '../../../imports/_lib'

export default defineEventHandler(async (event) => {
  noStore(event)
  // Sichtbarkeit wie ueberall am Profil: lesen darf jede Einrichtung, aendern
  // nur die besitzende. Hier wird nur gelesen.
  const { profile } = await visibleProfile(event)
  const sql = db()

  const version = Number(getRouterParam(event, 'version'))
  if (!Number.isInteger(version) || version < 1) {
    throw fail(400, 'profile_bad_version', {}, 'Keine gueltige Versionsnummer.')
  }

  const mapping = await versionMapping(sql, profile.id, version)
  if (mapping === null) {
    throw fail(404, 'profile_version_not_found', { version }, `Version ${version} gibt es nicht.`)
  }

  const meta = await sql<Array<{ name: string; created_at: string; user_name: string | null }>>`
    SELECT v.name, v.created_at, u.name AS user_name
      FROM mapping_profile_versions v
      LEFT JOIN users u ON u.id = v.user_id
     WHERE v.profile_id = ${profile.id} AND v.version = ${version}`

  return {
    profile: { id: profile.id, name: profile.name, currentVersion: profile.version },
    version: {
      version,
      name: meta[0]?.name ?? profile.name,
      createdAt: meta[0]?.created_at ?? null,
      userName: meta[0]?.user_name ?? null,
      isCurrent: version === profile.version
    },
    mapping,
    // Dieselben Zielbeschriftungen wie im Editor. Ohne sie stuenden hier
    // Schluessel wie work.title.primary statt "Werk › Haupttitel".
    targets: await editorTargets()
  }
})
