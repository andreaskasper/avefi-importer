/*
 * Pruefung der erzeugten AVefi-Datensaetze.
 *
 * Geprueft wird nicht hier, sondern im Dienst efi-conv: derselbe Validator und
 * dieselben Zusatzregeln wie "efi-conv check". Eine eigene Schemapruefung waere
 * eine zweite Wahrheit, die sich vom Original entfernen wuerde, sobald das
 * Schema sich aendert.
 */
import type { ValidationIssue } from '#shared/types/domain'

export interface CheckResponse {
  ok: boolean
  checked: number
  valid: number
  issues: ValidationIssue[]
  schema?: { source?: string | null; file?: string; version?: string | null; sha256?: string | null }
}

export interface CheckResult extends CheckResponse {
  /** Konnte der Dienst nicht befragt werden, steht hier der Grund. */
  unavailable: string | null
}

function baseUrl(): string {
  return (process.env.EFI_CONV_URL || 'http://efi-conv:8000').replace(/\/+$/, '')
}

/** So viele Datensaetze gehen in einer Anfrage an den Dienst. */
const BATCH = 500

/**
 * Prueft die Datensaetze in Buendeln.
 * row_map bildet die laufende Nummer auf die Quellzeile ab, damit Meldungen auf
 * die Tabellenzeile zeigen und nicht nur auf eine Position in der Ausgabe.
 */
export async function checkRecords(
  records: readonly Record<string, unknown>[],
  rowMap: Record<string, number> = {},
  timeoutMs = 120_000
): Promise<CheckResult> {
  if (records.length === 0) {
    return { ok: true, checked: 0, valid: 0, issues: [], unavailable: null }
  }

  const merged: CheckResult = { ok: true, checked: 0, valid: 0, issues: [], unavailable: null }

  for (let offset = 0; offset < records.length; offset += BATCH) {
    const slice = records.slice(offset, offset + BATCH)
    const sliceMap: Record<string, number> = {}
    slice.forEach((_, i) => {
      const global = String(offset + i + 1)
      const row = rowMap[global]
      if (row !== undefined) sliceMap[String(i + 1)] = row
    })

    let response: CheckResponse
    try {
      response = await postCheck(slice, sliceMap, timeoutMs)
    } catch (e) {
      merged.unavailable = e instanceof Error ? e.message : String(e)
      merged.issues.push({
        severity: 'warning',
        code: 'validation_unavailable',
        message: `Die Pruefung gegen das AVefi-Schema war nicht moeglich: ${merged.unavailable}. Die Datei wurde erzeugt, aber nicht geprueft.`
      })
      return merged
    }

    merged.checked += response.checked
    merged.valid += response.valid
    merged.ok = merged.ok && response.ok
    merged.schema = response.schema ?? merged.schema
    // Die Nummern des Dienstes zaehlen je Buendel — hier auf die Gesamtfolge heben.
    for (const issue of response.issues) {
      merged.issues.push(issue.record === undefined ? issue : { ...issue, record: issue.record + offset })
    }
  }

  return merged
}

async function postCheck(
  records: readonly Record<string, unknown>[],
  rowMap: Record<string, number>,
  timeoutMs: number
): Promise<CheckResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl()}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ records, row_map: rowMap }),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`efi-conv antwortete mit HTTP ${res.status}.`)
    return (await res.json()) as CheckResponse
  } finally {
    clearTimeout(timer)
  }
}

/** Schemainformation des Dienstes, fuer den Bericht. */
export async function schemaInfo(timeoutMs = 10_000): Promise<{ version: string | null; source: string | null } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl()}/health`, { signal: controller.signal })
    if (!res.ok) return null
    const body = (await res.json()) as { schema?: { version?: string | null; source?: string | null } }
    return { version: body.schema?.version ?? null, source: body.schema?.source ?? null }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
