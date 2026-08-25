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
  groupingLabel,
  groupsWorks,
  mergeRecords,
  newRunTally,
  runRow,
  workKey,
  type RunTally
} from '../mapping/runner'
import type { CanonicalRecord } from './types'

export interface RowOutcome {
  canonical: CanonicalRecord
  issues: ValidationIssue[]
}

/**
 * Haelt Profil und Sammelbericht eines Durchlaufs zusammen.
 * Der Sammelbericht zaehlt die Wertfehler je Spalte; er wandert danach in den
 * Pruefbericht des Imports, damit sichtbar bleibt, welche Spalte klemmt.
 */
export class ProfileRun {
  private tally: RunTally = newRunTally()

  constructor(private readonly mapping: MappingJson) {}

  get groupsWorks(): boolean {
    return groupsWorks(this.mapping)
  }

  get groupingLabel(): string {
    return groupingLabel(this.mapping)
  }

  runRow(row: SourceRow, baseId: string, rowNumber: number): RowOutcome {
    const result = runRow(this.mapping, row, baseId, {}, rowNumber)
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
