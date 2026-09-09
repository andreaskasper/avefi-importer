/*
 * GET /api/system/vorgabewerte — was beim Start aufgefallen ist.
 *
 * Nur fuer Administratoren. Die Antwort sagt, dass ein Wert aus der
 * Beispielkonfiguration in Gebrauch ist, und bei einem Konto welches. Sie sagt
 * nicht, welcher Wert es ist: Wer die Auskunft braucht, hat Zugang zur
 * Konfiguration, und wer nur die Oberflaeche sieht, soll aus der Warnung kein
 * Passwort ableiten koennen.
 */
import { gemerkteBefunde } from '../../lib/vorgabewerte'
import { requireAdmin } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { befunde: gemerkteBefunde() }
})
