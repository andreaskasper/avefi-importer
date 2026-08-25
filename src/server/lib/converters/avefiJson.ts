/*
 * Passthrough fuer Quellen, die bereits natives AVefi-JSON sind.
 *
 * Solche Dateien werden nicht neu gemappt. Sie werden nur in Datensaetze
 * gruppiert, damit Liste und Editor etwas anzeigen koennen; die Ausgabedatei
 * ist eine unveraenderte Kopie des Originals.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { AvefiNode, CanonicalRecord, Converter, ConvertedRecord } from './types'

export const AVEFI_JSON_KEY = 'avefi_json_v1'

/** Holt die Knotenliste aus den beiden bekannten Bauformen einer AVefi-Datei. */
export function avefiNodesOf(data: unknown): AvefiNode[] {
  if (Array.isArray(data)) return data.filter((n): n is AvefiNode => typeof n === 'object' && n !== null)
  if (data !== null && typeof data === 'object') {
    const container = data as Record<string, unknown>
    if (Array.isArray(container.has_record)) {
      return container.has_record.filter((n): n is AvefiNode => typeof n === 'object' && n !== null)
    }
    return [data as AvefiNode]
  }
  return []
}

function idsOf(node: AvefiNode): string[] {
  const list = node.has_identifier
  if (!Array.isArray(list)) return []
  return list
    .map((i) => (typeof i === 'object' && i !== null ? String((i as Record<string, unknown>).id ?? '') : ''))
    .filter((s) => s !== '')
}

function refIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list
    .map((i) => (typeof i === 'object' && i !== null ? String((i as Record<string, unknown>).id ?? '') : String(i)))
    .filter((s) => s !== '')
}

/**
 * Gruppiert eine flache AVefi-Knotenliste zu Datensaetzen.
 * Manifestationen haengen ueber is_manifestation_of am Werk, Exemplare ueber
 * is_item_of an der Manifestation.
 */
export function groupAvefiNodes(nodes: readonly AvefiNode[]): CanonicalRecord[] {
  const works: CanonicalRecord[] = []
  const workByRef = new Map<string, CanonicalRecord>()
  const recordByManifestationRef = new Map<string, CanonicalRecord>()
  const orphans: CanonicalRecord = { work: {}, manifestations: [], items: [] }

  for (const node of nodes) {
    if (node.category !== 'avefi:WorkVariant') continue
    const record: CanonicalRecord = { work: node, manifestations: [], items: [] }
    works.push(record)
    for (const id of idsOf(node)) workByRef.set(id, record)
  }

  for (const node of nodes) {
    if (node.category !== 'avefi:Manifestation') continue
    let target: CanonicalRecord | undefined
    for (const ref of refIds(node.is_manifestation_of)) {
      target = workByRef.get(ref)
      if (target) break
    }
    const record = target ?? orphans
    record.manifestations.push(node)
    for (const id of idsOf(node)) recordByManifestationRef.set(id, record)
  }

  for (const node of nodes) {
    if (node.category !== 'avefi:Item') continue
    let target: CanonicalRecord | undefined
    for (const ref of refIds(node.is_item_of)) {
      target = recordByManifestationRef.get(ref)
      if (target) break
    }
    ;(target ?? orphans).items.push(node)
  }

  if (orphans.manifestations.length > 0 || orphans.items.length > 0) works.push(orphans)
  return works
}

export class AvefiJsonConverter implements Converter {
  readonly key = AVEFI_JSON_KEY

  async *convert(path: string): AsyncGenerator<ConvertedRecord> {
    let data: unknown
    try {
      data = JSON.parse(await readFile(path, 'utf8'))
    } catch (e) {
      throw new Error(`Die Datei ist kein gueltiges JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
    const nodes = avefiNodesOf(data)
    if (nodes.length === 0) throw new Error('Die Datei enthaelt keine AVefi-Datensaetze.')

    const file = basename(path)
    let index = 0
    for (const record of groupAvefiNodes(nodes)) {
      index++
      yield { kind: 'canonical', canonical: record, source: { file, row: index } }
    }
  }
}
