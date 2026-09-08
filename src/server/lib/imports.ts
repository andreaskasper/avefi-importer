/*
 * Datenzugriff fuer Importe.
 *
 * Die Verbindung wird hereingereicht, nicht hier beschafft. In Nitro kommt sie
 * aus db(), im Worker aus standaloneDb(); beide Wege muessen dieselben
 * Funktionen benutzen koennen, ohne dass diese Datei wissen muss, in welchem
 * Prozess sie laeuft.
 */
import type { Sql } from 'postgres'
import type {
  BaseFormat,
  FormatDetail,
  ImportReport,
  ImportRow,
  ImportStatus,
  MappingJson,
  RunConfig,
  MappingProfileRow,
  ProfileSample
} from '#shared/types/domain'

export async function findImport(sql: Sql, id: string): Promise<ImportRow | null> {
  const rows = await sql<ImportRow[]>`SELECT * FROM imports WHERE id = ${id}`
  return rows[0] ?? null
}

export async function createImport(
  sql: Sql,
  data: {
    institutionId: number
    userId: number | null
    filename: string
    filesize: number
    baseFormat: BaseFormat | null
  }
): Promise<ImportRow> {
  const rows = await sql<ImportRow[]>`
    INSERT INTO imports (institution_id, user_id, filename, filesize, base_format, status, upload_progress)
    VALUES (${data.institutionId}, ${data.userId}, ${data.filename}, ${data.filesize}, ${data.baseFormat}, 'uploading', 0)
    RETURNING *`
  const row = rows[0]
  if (!row) throw new Error('Import konnte nicht angelegt werden.')
  return row
}

/**
 * Alle Importe einer Einrichtung, neueste zuerst.
 *
 * Die Grenze ist grosszuegig und absichtlich weit oberhalb dessen, was ein
 * Haus in absehbarer Zeit hochlaedt. Sie stand bis zum 08.09.2026 bei 200 und
 * schnitt still ab: Wer 201 Importe hatte, sah 200 und erfuhr es nicht. Wieviel
 * tatsaechlich da ist, sagt jetzt countImports, und die Liste weist es aus.
 *
 * Sortiert und gefiltert wird danach ueber den ganzen Bestand — nicht in der
 * Abfrage, weil die interessanten Merkmale (Beanstandungen, Ergebnis der
 * Schemapruefung) erst aus report_json abgeleitet werden und in keiner Spalte
 * stehen. Waechst der Bestand in eine Groessenordnung, in der das nicht mehr
 * traegt, gehoeren diese Merkmale in Spalten, nicht die Sortierung in SQL.
 */
export async function listImports(sql: Sql, institutionId: number, limit = 5000): Promise<ImportRow[]> {
  return sql<ImportRow[]>`
    SELECT * FROM imports
     WHERE institution_id = ${institutionId}
     ORDER BY created_at DESC
     LIMIT ${limit}`
}

/** Wieviele Importe die Einrichtung wirklich hat — fuer den Abgleich mit der Grenze. */
export async function countImports(sql: Sql, institutionId: number): Promise<number> {
  const rows = await sql<Array<{ n: string }>>`
    SELECT count(*)::text AS n FROM imports WHERE institution_id = ${institutionId}`
  return Number(rows[0]?.n ?? 0)
}

export async function setStatus(sql: Sql, id: string, status: ImportStatus, progress?: number): Promise<void> {
  if (progress === undefined) {
    await sql`UPDATE imports SET status = ${status}::import_status WHERE id = ${id}`
    return
  }
  await sql`UPDATE imports SET status = ${status}::import_status, upload_progress = ${progress} WHERE id = ${id}`
}

export async function setFile(
  sql: Sql,
  id: string,
  filename: string,
  filesize: number,
  baseFormat: BaseFormat | null
): Promise<void> {
  await sql`UPDATE imports SET filename = ${filename}, filesize = ${filesize}, base_format = ${baseFormat} WHERE id = ${id}`
}

export async function setStoragePath(sql: Sql, id: string, path: string): Promise<void> {
  await sql`UPDATE imports SET storage_path = ${path} WHERE id = ${id}`
}

export async function setFingerprint(sql: Sql, id: string, fingerprint: string): Promise<void> {
  await sql`UPDATE imports SET fingerprint = ${fingerprint} WHERE id = ${id}`
}

export async function setHeaderHash(sql: Sql, id: string, hash: string): Promise<void> {
  await sql`UPDATE imports SET header_hash = ${hash} WHERE id = ${id}`
}

/**
 * Formathinweis festhalten: den fertigen Text fuer den Altbestand und die
 * Bestandteile fuer die uebersetzte Anzeige.
 */
export async function setDetectedFormat(
  sql: Sql,
  id: string,
  label: string,
  detail: FormatDetail | null = null
): Promise<void> {
  await sql`
    UPDATE imports
       SET detected_format = ${label},
           format_detail = ${detail === null ? null : sql.json(detail as never)}
     WHERE id = ${id}`
}

export async function setSheet(sql: Sql, id: string, sheetName: string): Promise<void> {
  await sql`UPDATE imports SET sheet_name = ${sheetName} WHERE id = ${id}`
}

export async function setFormatProfile(sql: Sql, id: string, profileId: number): Promise<void> {
  await sql`UPDATE imports SET format_profile_id = ${profileId} WHERE id = ${id}`
}

export async function setMappingProfile(sql: Sql, id: string, profileId: number, version: number): Promise<void> {
  await sql`UPDATE imports SET mapping_profile_id = ${profileId}, mapping_version = ${version} WHERE id = ${id}`
}

/**
 * Das Spaltentrennzeichen festschreiben.
 *
 * Geraten wird nur einmal, beim Erkennen. Ohne diese Festlegung raet jeder
 * spaetere Lesevorgang neu — und dieselbe Datei kann nach einer Aenderung an
 * der Heuristik anders zerfallen, ohne dass sich Datei oder Profil geaendert
 * haben.
 */
export async function setDelimiter(sql: Sql, id: string, delimiter: string): Promise<void> {
  await sql`UPDATE imports SET delimiter = ${delimiter} WHERE id = ${id}`
}

/** Womit dieses Ergebnis entstanden ist — Grundlage der Frage "noch aktuell?". */
export async function setRunConfig(sql: Sql, id: string, config: RunConfig): Promise<void> {
  await sql`UPDATE imports SET run_config = ${sql.json(config as never)} WHERE id = ${id}`
}

export async function setReport(sql: Sql, id: string, report: ExtendedImportReport): Promise<void> {
  await sql`UPDATE imports SET report_json = ${sql.json(report as never)} WHERE id = ${id}`
}

export async function setCounts(sql: Sql, id: string, records: number, errors: number): Promise<void> {
  await sql`UPDATE imports SET record_count = ${records}, error_count = ${errors} WHERE id = ${id}`
}

export async function deleteImport(sql: Sql, id: string): Promise<void> {
  await sql`DELETE FROM imports WHERE id = ${id}`
}

/* --------------------------------------------------------- Formatprofile */

/** Legt bei Bedarf einen Eintrag fuer einen Konverterschluessel an. */
export async function ensureFormatProfile(
  sql: Sql,
  converterKey: string,
  label: string,
  baseFormat: string
): Promise<number> {
  const rows = await sql<Array<{ id: number }>>`
    INSERT INTO format_profiles (converter_key, label, base_format)
    VALUES (${converterKey}, ${label}, ${baseFormat})
    ON CONFLICT (converter_key) DO UPDATE SET label = EXCLUDED.label
    RETURNING id`
  const row = rows[0]
  if (!row) throw new Error('Formatprofil konnte nicht angelegt werden.')
  return row.id
}

/* ------------------------------------------------------- Mappingprofile */

export type MappingProfileForRun = Pick<MappingProfileRow, 'id' | 'name' | 'version' | 'base_format' | 'complete'> & {
  mapping_json: MappingJson
}

/** Das Profil der Institution zu einem Kopfzeilen-Hash. */
export async function findMappingProfile(
  sql: Sql,
  institutionId: number,
  headerHash: string
): Promise<MappingProfileForRun | null> {
  const rows = await sql<MappingProfileForRun[]>`
    SELECT id, name, version, base_format, complete, mapping_json
      FROM mapping_profiles
     WHERE institution_id = ${institutionId} AND header_hash = ${headerHash}`
  return rows[0] ?? null
}

export async function findMappingProfileById(sql: Sql, id: number): Promise<MappingProfileForRun | null> {
  const rows = await sql<MappingProfileForRun[]>`
    SELECT id, name, version, base_format, complete, mapping_json
      FROM mapping_profiles WHERE id = ${id}`
  return rows[0] ?? null
}

/* --------------------------------------------------------- Formatpruefung */

/**
 * Oeffnet eine Formatpruefung, sofern fuer diese Institution und diesen
 * Kopfzeilen-Hash noch keine offen ist.
 *
 * Im PHP-Stand wurde nur je Import entdoppelt: Zwanzig Dateien mit derselben
 * unbekannten Kopfzeile erzeugten zwanzig gleichlautende Aufgaben. Gezaehlt
 * wird deshalb ueber Institution und Hash — eine Kopfzeile, eine Aufgabe.
 * Dass die Tabelle keine Spalte fuer die Institution hat, aendert daran
 * nichts: Sie steht am Import und wird mitgelesen.
 */
export async function openFormatReview(
  sql: Sql,
  importId: string,
  institutionId: number,
  hash: string,
  sample: ProfileSample | Record<string, unknown>
): Promise<{ id: number; created: boolean }> {
  const existing = await sql<Array<{ id: number }>>`
    SELECT fr.id
      FROM format_reviews fr
      JOIN imports i ON i.id = fr.import_id
     WHERE fr.status = 'open'
       AND fr.fingerprint = ${hash}
       AND i.institution_id = ${institutionId}
     ORDER BY fr.id
     LIMIT 1`
  const found = existing[0]
  if (found) return { id: found.id, created: false }

  const rows = await sql<Array<{ id: number }>>`
    INSERT INTO format_reviews (import_id, fingerprint, status, sample_json)
    VALUES (${importId}, ${hash}, 'open', ${sql.json(sample as never)})
    RETURNING id`
  const row = rows[0]
  if (!row) throw new Error('Formatpruefung konnte nicht angelegt werden.')
  return { id: row.id, created: true }
}

export async function countOpenFormatReviews(sql: Sql, institutionId?: number): Promise<number> {
  const rows =
    institutionId === undefined
      ? await sql<Array<{ n: string }>>`SELECT COUNT(*) AS n FROM format_reviews WHERE status = 'open'`
      : await sql<Array<{ n: string }>>`
          SELECT COUNT(*) AS n FROM format_reviews fr
            JOIN imports i ON i.id = fr.import_id
           WHERE fr.status = 'open' AND i.institution_id = ${institutionId}`
  return Number(rows[0]?.n ?? 0)
}

/**
 * Der Bericht mit den Zusaetzen, die nur beim Erkennen anfallen.
 *
 * Die Tabellenblaetter einer Arbeitsmappe muessen zwischen zwei Schritten
 * ueberdauern: Der Worker findet sie, die Oberflaeche laesst waehlen. Da das
 * Datenbankschema unveraendert bleibt, liegen sie im vorhandenen report_json.
 */
export interface ExtendedImportReport extends ImportReport {
  stage?: 'download' | 'detect' | 'convert'
  converter?: string | null
  sheets?: Array<{ index: number; name: string; rows: number; cols: number; usable: boolean }>
  summary?: {
    records: number
    avefiRecords: number
    valid: number
    invalid: number
    rowErrors: number
  }
  mapping?: Record<string, unknown> | null
  parseDetail?: unknown
  /** Zaehlwerte der Normdaten-Aufloesung samt der geltenden Einstellungen. */
  authority?: Record<string, unknown>
}
