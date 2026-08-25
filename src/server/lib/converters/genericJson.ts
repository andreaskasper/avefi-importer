/*
 * Generischer Konverter fuer JSON-Objektlisten ohne eigenes Schema.
 *
 * Ein Element der obersten Ebene wird zu einem Datensatz. Verschachtelte Werte
 * werden zu Text zusammengefasst, damit die Zwischenform flach bleibt.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { Converter, ConvertedRecord, InternalRecord } from './types'
import { fromFlatFields } from './flatFields'

export const GENERIC_JSON_KEY = 'generic_json_v1'

export class GenericJsonConverter implements Converter {
  readonly key = GENERIC_JSON_KEY

  async *convert(path: string): AsyncGenerator<ConvertedRecord> {
    let data: unknown
    try {
      data = JSON.parse(await readFile(path, 'utf8'))
    } catch (e) {
      throw new Error(`Die Datei ist kein gueltiges JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
    const rows = Array.isArray(data) ? data : [data]
    const file = basename(path)
    let rowNumber = 0

    for (const raw of rows) {
      if (raw === null || typeof raw !== 'object') continue
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        flat[k] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      }
      if (Object.values(flat).every((v) => v.trim() === '')) continue
      rowNumber++
      const record: InternalRecord = fromFlatFields(flat, file, rowNumber)
      yield { kind: 'internal', record }
    }
  }
}
