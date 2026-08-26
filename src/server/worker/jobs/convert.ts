/*
 * Auftrag "worker/convert" — Konverter laden, Datensaetze erzeugen,
 * avefi.v1.json schreiben und einen Pruefbericht ablegen.
 *
 * Geprueft wird die ausgelieferte Datei, nicht ein Zwischenstand: Der Bericht
 * soll etwas ueber das aussagen, was die Institution weitergibt.
 *
 * Alles laeuft im Datenstrom. Datensaetze werden gebuendelt geschrieben, die
 * Ausgabedatei waechst mit, und die Pruefung geht bundweise an efi-conv. Damit
 * bleibt der Speicherbedarf unabhaengig von der Groesse der Lieferung.
 */
import type { Sql } from 'postgres'
import type { ValidationIssue } from '#shared/types/domain'
import type { ResolvedAuthorities } from '../../lib/authority/index'
import {
  authorityEnabledFromEnv, authorityLimitFromEnv, authorityServices, resolveForMapping
} from '../../lib/authority/index'
import { loadSchemaModel } from '../../lib/schema'
import { AvefiWriter, copyAsAvefi, tableFile } from '../../lib/storage'
import { findImport, findMappingProfileById, setCounts, setReport, setStatus, type ExtendedImportReport } from '../../lib/imports'
import { deleteRecordsOfImport, insertRecords, type NewRecord } from '../../lib/records'
import { makeConverter } from '../../lib/converters/factory'
import { AVEFI_JSON_KEY } from '../../lib/converters/avefiJson'
import { profileIdFromKey } from '../../lib/converters/profileTable'
import { buildFromInternal } from '../../lib/converters/avefi'
import { analyzeParse, diagnosticsToIssues } from '../../lib/converters/parseDiagnostics'
import { IssueCollector, type AvefiNode } from '../../lib/converters/types'
import { checkRecords } from '../validate'

/** So viele Datensaetze gehen in einem Rutsch in die Datenbank. */
const INSERT_BATCH = 200

/**
 * Nach dieser Zeit bricht das Nachschlagen ab. Ein haengender Normdatendienst
 * darf keinen Import blockieren; was fehlt, wird gemeldet und der Import laeuft
 * ohne die betroffenen IDs weiter.
 */
const AUTHORITY_TIMEOUT_MS = 15 * 60 * 1000

export async function run(sql: Sql, payload: Record<string, unknown>): Promise<void> {
  const startedAt = new Date().toISOString()
  const importId = String(payload.import_id ?? '')
  const record = importId !== '' ? await findImport(sql, importId) : null
  if (record === null) throw new Error('Import nicht gefunden.')

  const key = String(payload.converter_key ?? '')
  if (key === '') throw new Error('Es wurde kein Konverter angegeben.')

  const profileId = profileIdFromKey(key)
  const profile = profileId !== null ? await findMappingProfileById(sql, profileId) : null
  if (profileId !== null && profile === null) {
    throw new Error(`Das Mappingprofil #${profileId} ist nicht mehr vorhanden.`)
  }

  // Dasselbe Schema, mit dem der Editor rechnet. Ohne es sind Wertelisten leer
  // und die Pruefung der Normdatenquellen greift nicht — der Export saehe dann
  // anders aus als die Vorschau.
  const schema = await loadSchemaModel()

  // Normdaten und Laenderabgleich haengen HIER ein. Vorher rechnete der
  // Konvertierungsweg ohne Nachschlagedienste: Der country-Konverter liess
  // "DE" stehen, und keine einzige gefundene ID kam im Export an.
  let authority: ResolvedAuthorities | null = null
  const converter = makeConverter(key, {
    baseFormat: record.base_format,
    profile,
    services: { schema, ...authorityServices() },
    prepareAuthorities: async (requests) => {
      authority = await resolveForMapping(requests, {
        sql,
        schema,
        signal: AbortSignal.timeout(AUTHORITY_TIMEOUT_MS),
        onWarn: (m) => console.warn(`[convert] Normdaten: ${m}`)
      })
      return { schema, ...authorityServices(authority) }
    }
  })
  if (converter === null) throw new Error(`Fuer „${key}“ gibt es keinen Konverter.`)

  const path = await tableFile(record.id)
  if (path === null) throw new Error('Die Originaldatei fehlt.')

  const isNative = key === AVEFI_JSON_KEY

  // Wiederholbar: vorhandene Datensaetze dieses Imports entfernen.
  await deleteRecordsOfImport(sql, record.id)

  const issues = new IssueCollector(500)
  const writer = isNative ? null : await AvefiWriter.open(record.id)

  let recordCount = 0
  let rowErrors = 0
  let nodeCount = 0
  let valid = 0
  let checked = 0
  let schemaVersion: string | null = null
  let validationUnavailable: string | null = null

  let pendingRecords: NewRecord[] = []
  let pendingNodes: AvefiNode[] = []
  let pendingRowMap: Record<string, number> = {}

  const flushRecords = async (): Promise<void> => {
    if (pendingRecords.length === 0) return
    await insertRecords(sql, record.id, pendingRecords)
    pendingRecords = []
  }

  const flushValidation = async (force = false): Promise<void> => {
    if (pendingNodes.length === 0) return
    if (!force && pendingNodes.length < 500) return
    const offset = nodeCount - pendingNodes.length
    const result = await checkRecords(pendingNodes as Record<string, unknown>[], pendingRowMap)
    checked += result.checked
    valid += result.valid
    if (result.unavailable !== null) validationUnavailable = result.unavailable
    if (result.schema?.version) schemaVersion = result.schema.version
    for (const issue of result.issues) {
      issues.add(issue.record === undefined ? issue : { ...issue, record: issue.record + offset })
    }
    pendingNodes = []
    pendingRowMap = {}
  }

  try {
    for await (const converted of converter.convert(path)) {
      recordCount++
      let nodes: AvefiNode[]
      let source

      if (converted.kind === 'canonical') {
        source = converted.source
        nodes = [
          ...(Object.keys(converted.canonical.work).length > 0 ? [converted.canonical.work] : []),
          ...converted.canonical.manifestations,
          ...converted.canonical.items
        ]
        issues.addAll(converted.issues)
        if (converted.issues?.some((i) => i.severity === 'error')) rowErrors++
        pendingRecords.push({
          work: converted.canonical.work,
          manifestations: converted.canonical.manifestations,
          items: converted.canonical.items,
          source
        })
      } else {
        source = converted.record.source
        const built = buildFromInternal(converted.record, baseId(record.id, recordCount), recordCount)
        issues.addAll(converted.issues)
        issues.addAll(built.issues)
        if (built.issues.some((i) => i.severity === 'error')) rowErrors++
        nodes = built.nodes
        const [work, ...rest] = built.nodes
        pendingRecords.push({
          work: work ?? {},
          manifestations: rest.filter((n) => n.category === 'avefi:Manifestation'),
          items: rest.filter((n) => n.category === 'avefi:Item'),
          source
        })
      }

      if (writer !== null) {
        await writer.write(nodes)
        for (const node of nodes) {
          nodeCount++
          // Der Dienst zaehlt die Datensaetze eines Buendels ab 1; darueber
          // findet eine Meldung zurueck zur Zeile der Quelldatei.
          if (source.row !== undefined) pendingRowMap[String(pendingNodes.length + 1)] = source.row
          pendingNodes.push(node)
        }
      }

      if (pendingRecords.length >= INSERT_BATCH) await flushRecords()
      await flushValidation()
    }
  } catch (e) {
    issues.add({
      severity: 'error',
      code: 'read_failed',
      message: `Die Datei konnte nicht vollstaendig gelesen werden: ${e instanceof Error ? e.message : String(e)}`
    })
  }

  await flushRecords()

  let outputSize = 0
  if (writer !== null) {
    const closed = await writer.close()
    outputSize = closed.size
    nodeCount = closed.nodes
  } else {
    outputSize = await copyAsAvefi(record.id, path)
    // Die native Datei wurde nicht umgebaut; geprueft wird trotzdem, was
    // ausgeliefert wird.
    const { avefiNodesOf } = await import('../../lib/converters/avefiJson')
    const { readFile } = await import('node:fs/promises')
    const nodes = avefiNodesOf(JSON.parse(await readFile(path, 'utf8')))
    nodeCount = nodes.length
    pendingNodes = nodes
  }

  await flushValidation(true)

  if (recordCount === 0 && issues.count === 0) {
    issues.add({
      severity: 'error',
      code: 'no_records',
      message: 'Es wurden keine verwertbaren Datensaetze gefunden — die Datei ist womoeglich leer oder anders aufgebaut als angenommen.'
    })
  }

  // Bei null Datensaetzen zusaetzlich eine zeilengenaue Diagnose: Warum ging nichts?
  let parseDetail: unknown = null
  if (recordCount === 0) {
    const diagnostics = await analyzeParse(path, record.base_format)
    parseDetail = diagnostics
    for (const issue of diagnosticsToIssues(diagnostics)) issues.add(issue)
  }

  // Was beim Nachschlagen auffiel, gehoert in den Bericht: mehrdeutige Namen,
  // nicht erreichbare Dienste, erreichte Obergrenze.
  const resolvedAuthority: ResolvedAuthorities | null = authority
  if (resolvedAuthority !== null) issues.addAll(resolvedAuthority.issues)

  const invalid = Math.max(0, checked - valid)
  const report: ExtendedImportReport = {
    stage: 'convert',
    converter: key,
    mapping: typeof converter.report === 'function' ? converter.report() : null,
    ...(schemaVersion !== null ? { schemaVersion } : {}),
    startedAt,
    finishedAt: new Date().toISOString(),
    issues: issues.all(),
    summary: {
      records: recordCount,
      avefiRecords: nodeCount,
      valid,
      invalid,
      rowErrors
    }
  }
  if (parseDetail !== null) report.parseDetail = parseDetail
  if (resolvedAuthority !== null) {
    report.authority = {
      enabled: authorityEnabledFromEnv(),
      limit: authorityLimitFromEnv(),
      ...resolvedAuthority.stats
    }
  }

  await setReport(sql, record.id, report)
  await setCounts(sql, record.id, recordCount, rowErrors)
  await setStatus(sql, record.id, recordCount > 0 ? 'converted' : 'error')

  const validationNote = validationUnavailable === null ? '' : ' · Pruefung nicht moeglich'
  const authorityNote = resolvedAuthority === null
    ? ''
    : ` · Normdaten ${resolvedAuthority.stats.resolved}/${resolvedAuthority.stats.requested}`
      + ` (${resolvedAuthority.stats.fromCache} aus dem Zwischenspeicher)`
  console.log(
    `[convert] ${record.filename}: ${recordCount} Datensatz/-saetze, ${nodeCount} AVefi-Knoten, ` +
      `${invalid} mit Befund${validationNote}${authorityNote} → avefi.v1.json (${outputSize} Byte)`
  )
}

function baseId(importId: string, index: number): string {
  return `${importId.slice(0, 8)}_r${index}`
}
