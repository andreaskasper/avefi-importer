/*
 * Uebergang zur Mappinglogik.
 *
 * Das Ausfuehren eines Mappingprofils liegt in server/lib/mapping/ und gehoert
 * nicht zu den Konvertern. Diese Datei ist die einzige Stelle, an der die
 * Konverterkette den Mappingkern anspricht; aendert sich dort eine Signatur,
 * ist nur hier etwas zu tun.
 */
import type { MappingJson, ValidationIssue } from '#shared/types/domain'
import type { SourceRow } from '../mapping/header'
import {
  addToTally,
  collectAuthorityLookups,
  groupingLabel,
  groupsWorks,
  mergeRecords,
  newRunTally,
  runRow,
  workKey,
  type AuthorityRequest,
  type MappingServices,
  type RunTally
} from '../mapping/runner'
import type { CanonicalRecord } from './types'

export interface RowOutcome {
  canonical: CanonicalRecord
  issues: ValidationIssue[]
}

/**
 * Haelt Profil, Nachschlagedienste und Sammelbericht eines Durchlaufs zusammen.
 * Der Sammelbericht zaehlt die Wertfehler je Spalte; er wandert danach in den
 * Pruefbericht des Imports, damit sichtbar bleibt, welche Spalte klemmt.
 */
export class ProfileRun {
  private tally: RunTally = newRunTally()
  private services: MappingServices

  constructor(private readonly mapping: MappingJson, services: MappingServices = {}) {
    this.services = services
  }

  get groupsWorks(): boolean {
    return groupsWorks(this.mapping)
  }

  get groupingLabel(): string {
    return groupingLabel(this.mapping)
  }

  /**
   * Dienste nachtraeglich einhaengen.
   *
   * Normdaten stehen erst fest, wenn der Bedarf der ganzen Datei gesammelt und
   * aufgeloest ist. Das passiert vor der ersten Zeile, nicht waehrenddessen:
   * ein Nachschlagevorgang je Zeile waeren bei fuenftausend Zeilen fuenftausend
   * HTTP-Anfragen mitten im Auftrag.
   */
  useServices(services: MappingServices): void {
    this.services = services
  }

  /** Welche Werte muessen nachgeschlagen werden? Gerechnet wird im Kern. */
  collectAuthorities(rows: readonly SourceRow[]): AuthorityRequest[] {
    return collectAuthorityLookups(this.mapping, rows)
  }

  runRow(row: SourceRow, baseId: string, rowNumber: number): RowOutcome {
    const result = runRow(this.mapping, row, baseId, this.services, rowNumber)
    this.tally = addToTally(this.tally, result)

    // Beanstandungen des Mappings sind bereits ValidationIssue; die Zeile wird
    // ergaenzt, damit der Bericht auf die Quellzeile zeigen kann.
    const issues: ValidationIssue[] = result.issues.map((i) => ({ ...i, row: i.row ?? rowNumber }))
    return { canonical: result.canonical, issues }
  }

  workKey(row: SourceRow, canonical: CanonicalRecord): string | null {
    return workKey(this.mapping, row, canonical)
  }

  merge(base: CanonicalRecord, add: CanonicalRecord): CanonicalRecord {
    return mergeRecords(base, add)
  }

  report(): RunTally {
    return this.tally
  }
}

/**
 * So viele verschiedene Werte nimmt der Bedarf hoechstens auf.
 *
 * Der Kern sammelt den Bedarf aus einem Feld von Zeilen; eine Datei mit
 * dreihunderttausend Zeilen darf dafuer nicht vollstaendig in den Speicher.
 * Gesammelt wird deshalb buendelweise, und die Zahl der gemerkten Werte ist
 * gedeckelt. Der Deckel liegt weit ueber der Voreinstellung von
 * AUTHORITY_LIMIT (500): Was darueber liegt, wird ohnehin nicht mehr frisch
 * abgefragt, kann aber noch aus dem Zwischenspeicher beantwortet werden.
 */
export const MAX_AUTHORITY_VALUES = 5000

/**
 * Sammelt den Normdatenbedarf mehrerer Zeilenbuendel zu einer Liste zusammen.
 *
 * Ohne diese Klammer muesste die ganze Datei im Speicher stehen, bevor die
 * erste Abfrage laufen kann.
 */
export class AuthorityNeeds {
  private readonly byKey = new Map<string, { request: AuthorityRequest; seen: Set<string> }>()
  private values = 0
  private droppedValues = 0

  constructor(private readonly maxValues: number = MAX_AUTHORITY_VALUES) {}

  add(requests: readonly AuthorityRequest[]): void {
    for (const request of requests) {
      const key = `${request.column} ${request.source} ${request.kind}`
      let entry = this.byKey.get(key)
      if (entry === undefined) {
        entry = { request: { ...request, values: [] }, seen: new Set<string>() }
        this.byKey.set(key, entry)
      }
      for (const value of request.values) {
        if (entry.seen.has(value)) continue
        if (this.values >= this.maxValues) {
          this.droppedValues++
          continue
        }
        entry.seen.add(value)
        entry.request.values.push(value)
        this.values++
      }
    }
  }

  all(): AuthorityRequest[] {
    return [...this.byKey.values()].map((e) => e.request).filter((r) => r.values.length > 0)
  }

  /** Verschiedene Werte, die aufzuloesen sind. */
  get size(): number {
    return this.values
  }

  /** Werte, die wegen der Obergrenze gar nicht erst aufgenommen wurden. */
  get dropped(): number {
    return this.droppedValues
  }
}
