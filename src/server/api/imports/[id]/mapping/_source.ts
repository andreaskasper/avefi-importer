/*
 * Die Tabelle eines Imports als Quelle fuer den Mapping-Editor.
 *
 * Gelesen wird das herausgeloeste Tabellenblatt, falls vorhanden, sonst die
 * Originaldatei — dieselbe Datei, die spaeter konvertiert wird. Der Editor
 * arbeitet damit nie auf einer anderen Grundlage als die Konvertierung.
 */
import type { H3Event } from 'h3'
import type { ImportRow, UserRow } from '#shared/types/domain'
import { isTabular } from '#shared/types/domain'
import { tableFile } from '../../../../lib/storage'
import { readTable } from '../../../../lib/converters/table'
import { ownedImport } from '../../_lib'
import { fail, type TableSource, type UserWithInstitution } from '../../../mappings/_lib'

export interface ImportSource {
  user: UserWithInstitution
  row: ImportRow
  source: TableSource
}

/**
 * Import laden, Zugriff pruefen, Tabelle lesen.
 *
 * Jede Fehlerlage bekommt einen eigenen Code: eine fehlende Datei, ein Format
 * ohne Zuordnung und eine unlesbare Kopfzeile sind drei verschiedene Dinge und
 * brauchen drei verschiedene Saetze.
 */
export async function importSource(event: H3Event): Promise<ImportSource> {
  const { user, row } = (await ownedImport(event)) as { user: UserRow; row: ImportRow }
  if (user.institution_id === null) throw fail(409, 'no_institution', {}, 'Konto ohne Institution.')
  if (!isTabular(row.base_format)) {
    throw fail(409, 'not_tabular', { format: row.base_format ?? '' }, 'Kein tabellarisches Format.')
  }

  const path = await tableFile(row.id)
  if (path === null) throw fail(409, 'no_file', {}, 'Originaldatei fehlt.')

  let table
  try {
    // Mit dem festgehaltenen Trennzeichen, nicht mit einem neu geratenen.
    table = await readTable(path, row.base_format, undefined, row.delimiter as never)
  } catch (e) {
    throw fail(422, 'table_unreadable', { detail: e instanceof Error ? e.message : String(e) },
      'Tabelle nicht lesbar.')
  }
  if (table.columns.length === 0) throw fail(422, 'no_header', {}, 'Keine Kopfzeile gefunden.')

  return {
    user: user as UserWithInstitution,
    row,
    source: {
      columns: table.columns,
      rows: table.rows,
      rowCount: table.rowCount,
      distinct: table.distinct,
      headerHash: table.hash,
      baseFormat: row.base_format ?? 'csv'
    }
  }
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
