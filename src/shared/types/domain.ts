/**
 * Fachliche Typen des AVefi-Importers.
 *
 * Diese Datei ist die einzige Wahrheit fuer Backend und Oberflaeche. Sie liegt
 * bewusst in shared/, damit ein Feldname nicht an zwei Stellen gepflegt wird —
 * genau daran ist im PHP-Stand der Profil-Export ohne Stichprobe gescheitert.
 */

/* ------------------------------------------------------------------ Import */

export type ImportStatus =
  | 'uploading'
  | 'queued'
  | 'converting'
  | 'awaiting_format_review'
  | 'awaiting_sheet_choice'
  | 'converted'
  | 'error'

export interface ImportRow {
  id: string
  institution_id: number
  user_id: number | null
  filename: string
  filesize: number
  base_format: BaseFormat | null
  fingerprint: string | null
  header_hash: string | null
  format_profile_id: number | null
  mapping_profile_id: number | null
  mapping_version: number | null
  sheet_name: string | null
  status: ImportStatus
  upload_progress: number
  record_count: number
  error_count: number
  storage_path: string | null
  report_json: ImportReport | null
  detected_format: string | null
  format_detail: FormatDetail | null
  created_at: string
}

/**
 * Bestandteile des Formathinweises, getrennt statt als fertiger Satz.
 *
 * Serverseitig zusammengesetzte Saetze wie "CSV - 49 Spalten" lassen sich in
 * der Oberflaeche nicht mehr uebersetzen. Hier stehen die Teile; den Satz
 * bildet die Anzeige aus i18n-Schluesseln. Der Formatname selbst ist ein
 * Eigenname ("CSV", "Excel", "MARC-XML") und bleibt unuebersetzt.
 */
export interface FormatDetail {
  format: string
  /** Bei Arbeitsmappen: das gelesene Blatt. */
  sheet?: string
  /** Spaltenzahl der Tabelle. */
  columns?: number
  /** Zahl der Blaetter, solange noch keines gewaehlt ist. */
  sheets?: number
}

export type BaseFormat = 'csv' | 'tsv' | 'xlsx' | 'xml' | 'ead' | 'marcxml' | 'json'

/** Tabellarische Formate laufen ueber die Kopfzeilen-Aufloesung, nicht ueber Fingerprints. */
export const TABULAR_FORMATS: readonly BaseFormat[] = ['csv', 'tsv', 'xlsx'] as const

export function isTabular(f: BaseFormat | null | undefined): boolean {
  return !!f && (TABULAR_FORMATS as readonly string[]).includes(f)
}

/* -------------------------------------------------------------- Validierung */

export type Severity = 'error' | 'warning' | 'info'

/**
 * Strukturierte Meldung, wie sie der Vertrag in Paragraf 3 verlangt:
 * Schweregrad, Meldung sowie — soweit zuordenbar — Zeile bzw. Datensatz,
 * Quellfeld und AVefi-Schemafeld.
 */
export interface ValidationIssue {
  severity: Severity
  message: string
  /** 1-basierte Zeile der Quelldatei, sofern zuordenbar. */
  row?: number
  /** Laufende Nummer des erzeugten Datensatzes, sofern zuordenbar. */
  record?: number
  /** Spaltenname der Quelle. */
  sourceField?: string
  /** Pfad im AVefi-Schema, z. B. has_primary_title.has_name */
  targetField?: string
  /** Der Wert, an dem es scheiterte — gekuerzt, nie ein ganzer Datensatz. */
  value?: string
  /** Stabiler Bezeichner fuer Uebersetzung und Gruppierung. */
  code?: string
  /**
   * Anwendbarer Vorschlag zur Behebung, etwa „Konverter duration einfuegen?".
   * Die Oberflaeche darf ihn anbieten, nie von selbst anwenden — automatische
   * Korrektur von Validierungsfehlern ist vertraglich ausgeschlossen.
   */
  fix?: TransformStep
}

export interface ImportReport {
  issues: ValidationIssue[]
  /** Belegung je Kernfeld: Feldschluessel -> gefuellt von wie vielen. */
  coverage?: Record<string, { filled: number; total: number }>
  schemaVersion?: string
  efiConvVersion?: string
  startedAt?: string
  finishedAt?: string
}

/* --------------------------------------------------------------- Mapping */

/** Ein Konverterschritt. Immer ein Objekt mit op, nie ein nackter String —
 *  sonst gaebe es zwei Formen fuer dieselbe Sache, sobald ein Parameter dazukommt. */
export interface TransformStep {
  op: TransformOp
  [param: string]: unknown
}

export type TransformOp =
  | 'trim' | 'lowercase' | 'uppercase' | 'titlecase'
  | 'split' | 'take' | 'join' | 'replace' | 'regex' | 'prefix' | 'suffix'
  | 'date' | 'duration' | 'number' | 'boolean'
  | 'map' | 'default' | 'country' | 'language' | 'authority'
  | LegacyTransformOp

/**
 * Operationen aus dem PHP-Stand, die weiterhin ausgefuehrt werden, damit alte
 * Profile nicht brechen. Im Editorkatalog erscheinen sie nicht mehr.
 * Nachfolger: template -> prefix/suffix, year -> regex mit capture.
 * Fuer substring und concat gibt es keinen Nachfolger.
 */
export type LegacyTransformOp = 'substring' | 'concat' | 'year' | 'template'

export const LEGACY_OPS: readonly LegacyTransformOp[] = ['substring', 'concat', 'year', 'template'] as const

export interface TargetBinding {
  /** Schluessel aus dem TargetCatalog, z. B. work.title.primary */
  target: string
  /** Kette nach der Verzweigung. */
  post: TransformStep[]
}

export interface ColumnMapping {
  /** Gemeinsame Kette vor der Verzweigung. */
  pre?: TransformStep[]
  /** Ein oder mehrere Ziele — eine Spalte darf mehrfach landen. */
  targets?: TargetBinding[]
  /** Bewusst ignoriert. Fehlt beides, gilt die Spalte als NOCH NICHT ANGEFASST. */
  ignore?: boolean
  /** Zuordnung von Quellwerten auf Vokabularwerte. */
  valuemap?: Record<string, string>
  /** Bestaetigte Normdaten-Treffer: Quellwert -> Ressource. */
  authorities?: Record<string, { id: string; type: string; label?: string }>
}

export interface MappingDefault {
  target: string
  value: string
}

export interface GroupingRule {
  /** Zielschluessel, nach denen gruppiert wird — bevorzugt gemappte Werte, nicht Rohspalten. */
  by: string[]
}

/** Das gespeicherte und exportierbare Mappingprofil. */
export interface MappingJson {
  /** Format des Profils selbst. Vertrag Paragraf 3: Profilformat-Version. */
  profileFormatVersion: 1
  /** AVefi-Schemaversion, gegen die gemappt wurde. Vertrag Paragraf 3. */
  avefiSchemaVersion: string | null
  columns: Record<string, ColumnMapping>
  defaults: MappingDefault[]
  row: { represents: 'item' | 'manifestation' | 'work' }
  grouping: { work: GroupingRule; manifestation: GroupingRule }
}

export interface MappingProfileRow {
  id: number
  institution_id: number
  created_by_user_id: number | null
  header_hash: string
  base_format: BaseFormat
  name: string
  mapping_json: MappingJson
  sample_json: ProfileSample | null
  version: number
  complete: boolean
  derived_from_id: number | null
  created_at: string
  updated_at: string
}

/** Stichprobe im Profil — ohne sie verweigert der Editor den Dienst. */
export interface ProfileSample {
  columns: string[]
  rows: string[][]
  /** Je Spalte die verschiedenen gefuellten Werte mit Haeufigkeit. */
  values?: Record<string, Array<{ value: string; count: number }>>
  /** Belegung je Spalte: gefuellt in X von Y Zeilen. */
  coverage?: Record<string, { filled: number; total: number }>
}

/** Der exportierte Profil-Dateikopf. Reines Importer-Artefakt, kein Austauschformat mit efi-conv. */
export interface MappingProfileExport {
  origin: {
    application: 'avefi-importer'
    exportedAt: string
    profileName: string
    profileVersion: number
    institution?: string
  }
  profileFormatVersion: 1
  avefiSchemaVersion: string | null
  baseFormat: BaseFormat
  headerHash: string
  mapping: MappingJson
  /** Stichprobe muss mit, sonst laesst sich das Profil nicht bearbeiten. */
  sample: ProfileSample | null
}

/* ------------------------------------------------------------- Zielkatalog */

export type TargetLevel = 'work' | 'manifestation' | 'item'

export type TargetType =
  | 'text' | 'date' | 'duration' | 'number' | 'lang'
  | `enum:${string}` | `id:${string}`

export interface TargetEntry {
  key: string
  label: string
  level: TargetLevel
  group: string
  type: TargetType
  multi: boolean
  /** Vollstaendiger Schemapfad — der Vertrag verlangt seine Anzeige. */
  path: string
  description?: string
  /** Erlaubte Werte bei kontrolliertem Vokabular. */
  enumValues?: string[]
  pattern?: string
  /** Darf eine Normdaten-Anreicherung tragen. */
  acceptsAuthority?: boolean
}

/* -------------------------------------------------- Erzeugter AVefi-Satz */

/** Ein Knoten im AVefi-Schema (Work, Manifestation oder Item). */
export interface AvefiNode {
  category: string
  has_identifier?: Array<Record<string, unknown>>
  [field: string]: unknown
}

/** Was aus einer Quellzeile bzw. einer Gruppe von Zeilen entsteht. */
export interface AvefiRecord {
  work: AvefiNode
  manifestations: AvefiNode[]
  items: AvefiNode[]
}

/** Das, was in records.data_json steht. */
export interface RecordData {
  avefi: AvefiRecord
  /** Die Quellzeile(n), aus denen der Satz entstand. */
  source?: Record<string, string> | Array<Record<string, string>>
}

/* ------------------------------------------------------------- Datensaetze */

export interface RecordRow {
  id: number
  import_id: string
  work_title: string | null
  work_year: number | null
  work_type: string | null
  avefi_pid: string | null
  manifestation_count: number
  item_count: number
  completeness: number
  data_json: unknown
  source_row: number | null
  edited_at: string | null
  created_at: string
}

/* ------------------------------------------------------ Nutzer, Institution */

export interface UserRow {
  id: number
  institution_id: number | null
  email: string
  name: string
  is_admin: boolean
  active: boolean
  created_at: string
  last_login_at: string | null
}

export interface InstitutionRow {
  id: number
  name: string
  slug: string
  created_at: string
}

/* ------------------------------------------------------------ Worker-Queue */

export type JobClass = 'worker/download' | 'worker/detect' | 'worker/convert'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface WorkerJobRow {
  id: number
  classname: JobClass
  import_id: string | null
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
  run_at: string
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}
