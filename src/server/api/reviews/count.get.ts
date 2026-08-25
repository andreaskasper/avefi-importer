/*
 * GET /api/reviews/count — Zahl der offenen Formatpruefungen.
 *
 * Gezaehlt werden Aufgaben, nicht Zeilen: Das Abzeichen in der Kopfzeile muss
 * dieselbe Zahl nennen wie die Warteschlange unter /reviews, sonst sucht man
 * nach Arbeit, die es nicht gibt. Mehrere offene Eintraege zu derselben
 * Kopfzeile eines Hauses (aus dem PHP-Betrieb) sind eine Aufgabe.
 *
 * Die Kopfzeile fragt sie auf jeder Seite ab, auch ohne Anmeldung waehrend der
 * Weiterleitung. Deshalb antwortet der Endpunkt dann mit 0 statt mit 401 —
 * eine Fehlermeldung im Navigationsabzeichen hilft niemandem.
 */
import { db } from '../../db'
import { currentUser } from '../../utils/session'
import { groupReviews, openReviews } from './_lib'

export default defineEventHandler(async (event) => {
  // Die Zahl haengt am angemeldeten Konto und darf nicht zwischengespeichert werden.
  setHeader(event, 'cache-control', 'no-store, private, max-age=0')
  setHeader(event, 'vary', 'cookie')
  const user = await currentUser(event)
  if (user === null) return { open: 0 }
  // openReviews beruecksichtigt selbst, ob alle Haeuser oder nur das eigene zaehlen.
  const rows = await openReviews(db(), user)
  return { open: groupReviews(rows).length }
})
