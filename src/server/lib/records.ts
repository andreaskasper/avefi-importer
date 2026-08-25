/*
 * Datenzugriff fuer erzeugte Datensaetze.
 *
 * data_json haelt den vollstaendigen AVefi-Datensatz samt Herkunft; die
 * Listenspalten (Titel, Jahr, Art, Zaehler) sind daraus abgeleitet und dienen
 * nur der Anzeige und Sortierung.
 */
import type { Sql } from 'postgres'
import type { RecordRow } from '#shared/types/domain'
import type { AvefiNode, SourceInfo } from './converters/types'
import { completeness, workDisplay } from './converters/avefi'

/** Was in data_json steht. */
export interface RecordPayload {
  avefi: {
    work: AvefiNode
    manifestations: AvefiNode[]
    items: AvefiNode[]
  }
  source: SourceInfo
}

export async function deleteRecordsOfImport(sql: Sql, importId: string): Promise<void> {
  await sql`DELETE FROM records WHERE import_id = ${importId}`
}

export interface NewRecord {
  work: AvefiNode
  manifestations: AvefiNode[]
  items: AvefiNode[]
  source: SourceInfo
}

function toRow(importId: string, rec: NewRecord): Record<string, unknown> {
  const nodes = [rec.work, ...rec.manifestations, ...rec.items]
  const display = workDisplay(rec.work)
  const payload: RecordPayload = {
    avefi: { work: rec.work, manifestations: rec.manifestations, items: rec.items },
    source: rec.source
  }
  return {
    import_id: importId,
    work_title: display.title,
    work_year: display.year,
    work_type: display.type,
    manifestation_count: rec.manifestations.length,
    item_count: rec.items.length,
    completeness: completeness(nodes),
    data_json: payload,
    source_row: rec.source.row ?? null
  }
}

export async function insertRecord(sql: Sql, importId: string, rec: NewRecord): Promise<number> {
  const row = toRow(importId, rec)
  const rows = await sql<Array<{ id: number }>>`
    INSERT INTO records ${sql(row as never)} RETURNING id`
  const inserted = rows[0]
  if (!inserted) throw new Error('Datensatz konnte nicht angelegt werden.')
  return inserted.id
}

/**
 * Mehrere Datensaetze in einem Rutsch.
 * Einzelne INSERTs kosten bei 300.000 Zeilen eine Netzwerkrunde je Zeile;
 * gebuendelt bleibt die Konvertierung im Sekundenbereich.
 */
export async function insertRecords(sql: Sql, importId: string, list: readonly NewRecord[]): Promise<number> {
  if (list.length === 0) return 0
  const rows = list.map((r) => toRow(importId, r))
  await sql`INSERT INTO records ${sql(rows as never)}`
  return rows.length
}

export async function listRecords(sql: Sql, importId: string, limit = 500, offset = 0): Promise<RecordRow[]> {
  return sql<RecordRow[]>`
    SELECT * FROM records WHERE import_id = ${importId} ORDER BY id LIMIT ${limit} OFFSET ${offset}`
}

export async function countRecords(sql: Sql, importId: string): Promise<number> {
  const rows = await sql<Array<{ n: string }>>`SELECT COUNT(*) AS n FROM records WHERE import_id = ${importId}`
  return Number(rows[0]?.n ?? 0)
}

export async function findRecord(sql: Sql, id: number, importId: string): Promise<RecordRow | null> {
  const rows = await sql<RecordRow[]>`SELECT * FROM records WHERE id = ${id} AND import_id = ${importId}`
  return rows[0] ?? null
}

/** Speichert einen von Hand bearbeiteten Datensatz und pflegt die Listenspalten. */
export async function saveRecord(sql: Sql, id: number, importId: string, rec: NewRecord): Promise<void> {
  const nodes = [rec.work, ...rec.manifestations, ...rec.items]
  const display = workDisplay(rec.work)
  const payload: RecordPayload = {
    avefi: { work: rec.work, manifestations: rec.manifestations, items: rec.items },
    source: rec.source
  }
  await sql`
    UPDATE records
       SET work_title = ${display.title},
           work_year = ${display.year},
           work_type = ${display.type},
           manifestation_count = ${rec.manifestations.length},
           item_count = ${rec.items.length},
           completeness = ${completeness(nodes)},
           data_json = ${sql.json(payload as never)},
           edited_at = now()
     WHERE id = ${id} AND import_id = ${importId}`
}

export async function markEdited(sql: Sql, id: number, importId: string): Promise<void> {
  await sql`UPDATE records SET edited_at = now() WHERE id = ${id} AND import_id = ${importId}`
}

export async function countEdited(sql: Sql, importId: string): Promise<number> {
  const rows = await sql<Array<{ n: string }>>`
    SELECT COUNT(*) AS n FROM records WHERE import_id = ${importId} AND edited_at IS NOT NULL`
  return Number(rows[0]?.n ?? 0)
}

/** import_id -> Anzahl bearbeiteter Datensaetze, fuer eine ganze Institution. */
export async function editedCounts(sql: Sql, institutionId: number): Promise<Record<string, number>> {
  const rows = await sql<Array<{ import_id: string; n: string }>>`
    SELECT r.import_id, COUNT(*) AS n
      FROM records r JOIN imports i ON i.id = r.import_id
     WHERE i.institution_id = ${institutionId} AND r.edited_at IS NOT NULL
     GROUP BY r.import_id`
  const out: Record<string, number> = {}
  for (const r of rows) out[r.import_id] = Number(r.n)
  return out
}
