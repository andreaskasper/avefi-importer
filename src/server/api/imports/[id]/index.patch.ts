/*
 * PATCH /api/imports/:id — einem Import einen Anzeigenamen geben.
 *
 * Der Dateiname bleibt, wie er hochgeladen wurde. Er ist die Verbindung zur
 * Lieferung des Archivs, und ein frei gewaehlter Name darf sie nicht ersetzen;
 * der Anzeigename steht daneben. Gewuenscht von Matti Stoehr (#1), weil
 * mehrere Laeufe derselben Datei in der Liste nur am Zeitstempel zu
 * unterscheiden waren.
 *
 * Ein leerer Name loescht die Angabe wieder — dann steht wie bisher der
 * Dateiname allein da.
 */
import { db } from '../../../db'
import { fail, ownedImport } from '../_lib'

const MAX = 200

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const body = (await readBody(event)) as { label?: unknown }
  const label = String(body?.label ?? '').trim()
  if (label.length > MAX) {
    throw fail(400, 'label_too_long', { max: MAX }, 'Anzeigename zu lang.')
  }

  const wert = label === '' ? null : label
  await db()`UPDATE imports SET label = ${wert} WHERE id = ${row.id}`
  return { id: row.id, label: wert, filename: row.filename }
})
