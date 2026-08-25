/*
 * POST /api/imports/:id/sheets — gewaehlte Tabellenblaetter uebernehmen.
 *
 * Jedes gewaehlte Blatt wird ein eigener Import: Zwei Blaetter mit
 * verschiedenen Spalten brauchen verschiedene Zuordnungen. Die Aufteilung
 * macht chooseSheets() in der Fachlogik, hier steht nur die Pruefung der
 * Eingabe.
 */
import { z } from 'zod'
import { db } from '../../../db'
import { firstOrgFile } from '../../../lib/storage'
import { listSheets } from '../../../lib/converters/spreadsheet'
import { chooseSheets } from '../../../worker/jobs/detect'
import type { ExtendedImportReport } from '../../../lib/imports'
import { fail, ownedImport } from '../_lib'

const Body = z.object({ sheets: z.array(z.string()).min(1) })

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw fail(400, 'no_selection', {}, 'Kein Blatt gewaehlt.')

  const report = (row.report_json ?? null) as ExtendedImportReport | null
  let known = (report?.sheets ?? []).map((s) => s.name)
  if (known.length === 0) {
    const path = await firstOrgFile(row.id)
    if (path === null) throw fail(409, 'no_file', {}, 'Originaldatei fehlt.')
    known = (await listSheets(path, row.base_format).catch(() => [])).map((s) => s.name)
  }

  // Reihenfolge der Mappe, nicht die des Formulars — sonst haengt es vom
  // Anklicken ab, welches Blatt beim bestehenden Import bleibt.
  const wanted = known.filter((name) => parsed.data.sheets.includes(name))
  if (wanted.length === 0) {
    const unknown = parsed.data.sheets.filter((n) => !known.includes(n))
    throw fail(400, unknown.length > 0 ? 'sheet_unknown' : 'no_selection', { sheets: unknown }, 'Blattauswahl ungueltig.')
  }

  try {
    const ids = await chooseSheets(db(), row, wanted)
    return { ok: true, ids, sheets: wanted }
  } catch (e) {
    throw fail(500, 'extract_failed', { detail: e instanceof Error ? e.message : String(e) }, 'Blatt nicht lesbar.')
  }
})
