/*
 * GET /api/reviews — die Warteschlange der Formatpruefungen.
 *
 * Gezeigt wird eine Aufgabe je Institution und Kopfzeilen-Hash, nicht eine je
 * Datei. Wie viele Dateien an einer Aufgabe haengen, steht daneben — sonst
 * sieht es aus, als waere Arbeit verschwunden.
 *
 * "rows" nennt zusaetzlich die Zahl der offenen Eintraege in der Tabelle. Sie
 * kann groesser sein als die Zahl der Aufgaben, weil aus dem PHP-Betrieb noch
 * doppelte Eintraege stammen (#11 und #12 zum selben Hash). Das Abzeichen in
 * der Kopfzeile zaehlt dieselben Aufgaben wie diese Liste.
 */
import { db } from '../../db'
import { groupReviews, openReviews, requireReviewer } from './_lib'

export default defineEventHandler(async (event) => {
  const user = await requireReviewer(event)
  const rows = await openReviews(db(), user)
  const tasks = groupReviews(rows)

  return {
    tasks,
    rows: rows.length,
    duplicates: rows.length - tasks.length
  }
})
