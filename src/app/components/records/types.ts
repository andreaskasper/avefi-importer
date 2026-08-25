/*
 * Was die Oberflaeche von den Datensatz-Endpunkten erwartet.
 */
import type { AvefiNode, AvefiRecord, Severity, ValidationIssue } from '#shared/types/domain'
import type { TargetEntry } from '#shared/types/domain'

export type { AvefiNode, AvefiRecord, ValidationIssue }

/* ------------------------------------------------------------------ Konfiguration */

export interface SubjectKind {
  kind: string
  category: string
  agentType: string | null
  sameAsTypes: string[]
  sources: string[]
}

export interface ActivityCategory {
  category: string
  enumName: string
  hasValues: boolean
}

export interface EventCategory {
  category: string
  enumName: string | null
  hasValues: boolean
}

export interface ResourceType {
  category: string
  pattern: string | null
}

export interface EditorConfig {
  schemaVersion: string | null
  schemaError: string | null
  enums: Record<string, string[]>
  subjectKinds: SubjectKind[]
  activityCategories: ActivityCategory[]
  eventCategories: EventCategory[]
  resourceTypes: Record<string, ResourceType>
  targets: TargetEntry[]
}

/* ---------------------------------------------------------------------- Liste */

export interface RecordListItem {
  id: number
  title: string | null
  year: number | null
  type: string | null
  pid: string | null
  manifestations: number
  items: number
  completeness: number
  ring: string
  contributors: string[]
  sourceRow: number | null
  editedAt: string | null
  missing: string[]
}

export interface RecordImportInfo {
  id: string
  filename: string
  base_format: string | null
  detected_format?: string | null
  status: string
  sheet_name?: string | null
  record_count?: number
}

export interface RecordListResponse {
  import: RecordImportInfo
  records: RecordListItem[]
  total: number
  filtered: number
  edited: number
  limit: number
  offset: number
  query: string
}

/* --------------------------------------------------------------------- Editor */

export interface CompletenessHint {
  level: Severity | 'ok'
  text: string
}

export interface RecordDetailResponse {
  import: RecordImportInfo
  record: {
    id: number
    title: string | null
    year: number | null
    type: string | null
    pid: string | null
    completeness: number
    ring: string
    sourceRow: number | null
    editedAt: string | null
    createdAt: string
    contributors: string[]
  }
  avefi: AvefiRecord
  hints: CompletenessHint[]
  prev: number | null
  next: number | null
}

export interface CheckResponse {
  checked: number
  valid: number
  issues: ValidationIssue[]
  schema?: { version?: string | null; source?: string | null } | null
  unavailable: string | null
  completeness?: number
  hints: CompletenessHint[]
}

export interface SaveResponse extends CheckResponse {
  ok: true
  completeness: number
  ring: string
  editedAt: string | null
  title: string | null
  avefi: AvefiRecord
}

/* ----------------------------------------------------------------- Normdaten */

export interface AuthorityHit {
  source: string
  id: string
  label: string
  description: string
  agentType: string
  resourceType: string
  category: string
  uri: string
  exact: boolean
}

export interface AuthoritySearchResponse {
  results: AuthorityHit[]
  warnings: string[]
  sources: string[]
}

export interface AuthorityDetailResponse {
  detail: {
    source: string
    id: string
    title: string
    description: string
    extract: string
    image: string
    url: string
    wikiUrl: string
  }
  found: boolean
  warnings: string[]
}
