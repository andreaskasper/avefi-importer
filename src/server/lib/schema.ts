/*
 * Das AVefi-Schema von der Platte lesen — einmal je Prozess.
 *
 * server/lib/mapping/ laedt nichts selbst; das Modell wird hereingereicht. Wer
 * es hereinreicht, muss es aber irgendwo herbekommen, und bisher stand dafuer
 * in jedem Einstiegspunkt eine eigene Kopie derselben Pfadliste. Der
 * Hintergrundprozess hatte gar keine — er konvertierte ohne Schema, waehrend
 * die Vorschau eines geladen hatte. Zwei Wahrheiten, ein Unterschied, den
 * niemand sieht: genau die Sorte Fehler, die dieses Projekt schon zweimal
 * getroffen hat.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SchemaModel } from './mapping/index'
import { EMPTY_SCHEMA_MODEL, createSchemaModel, getSchemaModel, setSchemaModel } from './mapping/index'

/** Wo das Schema liegen kann — Entwicklung, Auslieferung, Kopie im Serverbuendel. */
export const SCHEMA_CANDIDATES = [
  'public/schema/avefi/model.schema.json',
  '.output/public/schema/avefi/model.schema.json',
  'server/public/schema/avefi/model.schema.json',
  '../public/schema/avefi/model.schema.json'
]

/** Ein Enum, an dem sich erkennen laesst, ob ueberhaupt etwas geladen ist. */
const PROBE = 'TitleTypeEnum'

let pending: Promise<SchemaModel> | null = null
let lastError: string | null = null

async function load(): Promise<SchemaModel> {
  // Hat ein anderer Teil der Anwendung das Schema bereits hinterlegt, gilt seines.
  const current = getSchemaModel()
  if (current.enum(PROBE).length > 0) return current

  const tried: string[] = []
  for (const rel of SCHEMA_CANDIDATES) {
    const path = resolve(process.cwd(), rel)
    try {
      const model = createSchemaModel(JSON.parse(await readFile(path, 'utf8')))
      if (model.enum(PROBE).length === 0) {
        tried.push(`${rel}: enthaelt kein ${PROBE}`)
        continue
      }
      setSchemaModel(model)
      lastError = null
      return model
    } catch (e) {
      tried.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  lastError = `Das AVefi-Schema konnte nicht geladen werden (${tried.join('; ')}).`
  // Kein Abbruch: ohne Schema wird milder geprueft statt gar nicht gearbeitet.
  return EMPTY_SCHEMA_MODEL
}

export function loadSchemaModel(): Promise<SchemaModel> {
  if (pending === null) {
    pending = load().catch((e: unknown) => {
      pending = null
      throw e
    })
  }
  return pending
}

/** Grund des letzten Fehlschlags, sonst null. */
export function schemaLoadError(): string | null {
  return lastError
}
