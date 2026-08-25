/*
 * GET /api/imports/:id/sheets — Tabellenblaetter einer Arbeitsmappe.
 *
 * Die Liste steht im Bericht, weil sie zwischen zwei Schritten ueberdauern
 * muss: Der Hintergrundprozess findet die Blaetter, ein Mensch waehlt. Fehlt
 * sie dort (Altimport), wird sie einmal frisch gelesen.
 */
import { firstOrgFile } from '../../../lib/storage'
import { listSheets } from '../../../lib/converters/spreadsheet'
import type { ExtendedImportReport } from '../../../lib/imports'
import { fail, ownedImport } from '../_lib'

export default defineEventHandler(async (event) => {
  const { row } = await ownedImport(event)
  const report = (row.report_json ?? null) as ExtendedImportReport | null

  let sheets = report?.sheets ?? []
  if (sheets.length === 0) {
    const path = await firstOrgFile(row.id)
    if (path === null) throw fail(409, 'no_file', {}, 'Originaldatei fehlt.')
    sheets = await listSheets(path, row.base_format).catch(() => [])
  }
  if (sheets.length === 0) throw fail(409, 'no_sheets', {}, 'Keine Blattliste vorhanden.')

  return { import: { id: row.id, filename: row.filename, status: row.status }, sheets }
})
