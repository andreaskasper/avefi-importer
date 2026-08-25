/*
 * POST /api/imports/:id/reconvert — den Import erneut aus der Originaldatei erzeugen.
 *
 * Die Rueckfrage stellt die Oberflaeche, weil nur dort steht, wie viele
 * Datensaetze von Hand bearbeitet wurden. Hier wird geprueft, ob es
 * ueberhaupt etwas zu konvertieren gibt — eine fehlende Originaldatei und ein
 * fehlender Konverter sind zwei verschiedene Lagen und bekommen zwei
 * verschiedene Meldungen.
 */
import { db } from '../../../db'
import { setStatus } from '../../../lib/imports'
import { tableFile } from '../../../lib/storage'
import { profileKey } from '../../../lib/converters/profileTable'
import { enqueue } from '../../../worker/queue'
import { fail, ownedImport } from '../_lib'

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const sql = db()

  if ((await tableFile(row.id)) === null) {
    throw fail(409, 'no_file', {}, 'Originaldatei fehlt.')
  }

  let key: string | null = null
  if (row.mapping_profile_id !== null) {
    key = profileKey(row.mapping_profile_id)
  } else if (row.format_profile_id !== null) {
    const rows = await sql<Array<{ converter_key: string }>>`
      SELECT converter_key FROM format_profiles WHERE id = ${row.format_profile_id}`
    key = rows[0]?.converter_key ?? null
  }
  if (key === null) throw fail(409, 'no_converter', {}, 'Kein Konverter zugeordnet.')

  await setStatus(sql, row.id, 'converting')
  await enqueue(sql, 'worker/convert', { import_id: row.id, converter_key: key }, row.id)
  return { ok: true, id: row.id, converter: key }
})
