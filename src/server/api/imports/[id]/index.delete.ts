/* DELETE /api/imports/:id — Import samt Dateien und Datensaetzen entfernen. */
import { db } from '../../../db'
import { deleteImport } from '../../../lib/imports'
import { deleteImportFiles } from '../../../lib/storage'
import { ownedImport } from '../_lib'

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  // Erst die Dateien, dann die Zeile: Bricht das Loeschen der Dateien ab,
  // bleibt der Import sichtbar und laesst sich erneut loeschen. Umgekehrt
  // haetten wir Dateileichen ohne Eintrag.
  await deleteImportFiles(row.id)
  await deleteImport(db(), row.id)
  return { ok: true, id: row.id }
})
