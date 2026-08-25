/*
 * Tabelle plus gespeichertes Mappingprofil — der Regelweg fuer CSV, TSV und
 * herausgeloeste Excel-Blaetter.
 *
 * Ohne Werkbildung wird gestroemt: eine Zeile, ein Datensatz. Mit Werkbildung
 * muss gesammelt werden, weil erst am Ende feststeht, welche Zeilen
 * zusammengehoeren.
 */
import { basename } from 'node:path'
import type { BaseFormat, MappingJson, MappingProfileRow, ValidationIssue } from '#shared/types/domain'
import type { CanonicalRecord, Converter, ConvertedRecord } from './types'
import { streamTableRows } from './table'
import { ProfileRun } from './mappingBridge'

export const PROFILE_KEY_PREFIX = 'mapping_profile:'

export function profileKey(profileId: number): string {
  return `${PROFILE_KEY_PREFIX}${profileId}`
}

export function profileIdFromKey(key: string): number | null {
  if (!key.startsWith(PROFILE_KEY_PREFIX)) return null
  const id = Number(key.slice(PROFILE_KEY_PREFIX.length))
  return Number.isInteger(id) && id > 0 ? id : null
}

export type ProfileForRun = Pick<MappingProfileRow, 'id' | 'name' | 'version' | 'base_format'> & {
  mapping_json: MappingJson
}

export class ProfileTableConverter implements Converter {
  readonly key: string
  private rows = 0
  private works = 0
  private run: ProfileRun

  constructor(
    private readonly profile: ProfileForRun,
    private readonly baseFormat: BaseFormat | null
  ) {
    this.key = profileKey(profile.id)
    this.run = new ProfileRun(profile.mapping_json)
  }

  async *convert(path: string): AsyncGenerator<ConvertedRecord> {
    const file = basename(path)
    const format = this.baseFormat ?? (this.profile.base_format as BaseFormat | null)
    const grouping = this.run.groupsWorks

    const bucket: Array<{ canonical: CanonicalRecord; rows: number[]; issues: ValidationIssue[] }> = []
    const byKey = new Map<string, number>()

    for await (const { row, rowNumber } of streamTableRows(path, format)) {
      this.rows++

      let outcome
      try {
        outcome = this.run.runRow(row, `r${rowNumber}`, rowNumber)
      } catch (e) {
        // Eine Zeile, die das Profil nicht verarbeiten kann, darf den Import
        // nicht abbrechen. Sie wird gemeldet und uebersprungen — verschwiegen
        // wuerde sie nur den Zaehler verfaelschen.
        yield {
          kind: 'canonical',
          canonical: { work: {}, manifestations: [], items: [] },
          source: { file, row: rowNumber, profile: this.profile.id },
          issues: [
            {
              severity: 'error',
              message: `Zeile konnte nicht nach AVefi umgesetzt werden: ${e instanceof Error ? e.message : String(e)}`,
              row: rowNumber,
              code: 'mapping_failed'
            }
          ]
        }
        continue
      }

      if (!grouping) {
        this.works++
        yield {
          kind: 'canonical',
          canonical: outcome.canonical,
          source: { file, row: rowNumber, profile: this.profile.id },
          issues: outcome.issues
        }
        continue
      }

      const key = this.run.workKey(row, outcome.canonical)
      if (key === null) {
        bucket.push({ canonical: outcome.canonical, rows: [rowNumber], issues: outcome.issues })
        continue
      }
      const at = byKey.get(key)
      if (at === undefined) {
        byKey.set(key, bucket.length)
        bucket.push({ canonical: outcome.canonical, rows: [rowNumber], issues: outcome.issues })
        continue
      }
      const target = bucket[at]
      if (target) {
        target.canonical = this.run.merge(target.canonical, outcome.canonical)
        target.rows.push(rowNumber)
        target.issues.push(...outcome.issues)
      }
    }

    for (const entry of bucket) {
      this.works++
      yield {
        kind: 'canonical',
        canonical: entry.canonical,
        source: { file, row: entry.rows[0], rows: entry.rows, profile: this.profile.id },
        issues: entry.issues
      }
    }
  }

  report(): Record<string, unknown> {
    const tally = this.run.report()
    return {
      profile: { id: this.profile.id, name: this.profile.name, version: this.profile.version },
      grouping: this.run.groupingLabel,
      rows: this.rows,
      works: this.works,
      valueErrors: tally.valueErrors,
      columnIssues: tally.columnIssues,
      idOrigins: tally.idOrigins
    }
  }
}
