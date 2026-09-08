/*
 * Was die Oberflaeche von den Datensatz-Endpunkten erwartet.
 */
import type { AvefiNode, AvefiRecord, CoreScore, CoreState, ValidationIssue } from '#shared/types/domain'
import type { TargetEntry } from '#shared/types/domain'

/*
 * Die Antwortformen der Datensatz-Endpunkte stehen seit dem 07.09.2026 in
 * shared/types/domain.ts und werden hier nur weitergereicht. Solange sie hier
 * standen, kannten sie nur die Oberflaeche — und `core` konnte aus der Antwort
 * verschwinden, ohne dass es auffiel.
 */
export type { AvefiNode, AvefiRecord, CoreScore, CoreState, ValidationIssue }
export type {
  CheckResponse, CompletenessHint, RecordDetailInfo, RecordDetailResponse,
  RecordImportInfo, SaveResponse
} from '#shared/types/domain'

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
  /** Belegte Kernfelder statt eines Prozentwerts. */
  core: CoreScore
  coreState: CoreState
  contributors: string[]
  sourceRow: number | null
  editedAt: string | null
  missing: string[]
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
