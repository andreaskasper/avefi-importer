/*
 * Das AVefi-Schema fuer die Endpunkte dieses Bereichs.
 *
 * SchemaModel wird von der Mappinglogik hereingereicht, nicht selbst geladen —
 * das ist Absicht (server/lib bleibt ohne Dateisystem pruefbar). Irgendwer muss
 * es aber laden, sonst sind saemtliche Wertelisten leer und der Editor bietet
 * leere Auswahlfelder an. Das passiert hier, einmal je Prozess.
 *
 * Faellt das Laden aus, gibt es kein leises Weiter: schemaLoadError() nennt den
 * Grund, und die Oberflaeche zeigt statt gruener Auswahlfelder einen Hinweis mit
 * freier Eingabe. Eine leere Werteliste hinter einer normal aussehenden Auswahl
 * war im PHP-Stand genau der Fehler, der niemandem auffiel.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SchemaModel } from '../../lib/mapping/index'
import { createSchemaModel, EMPTY_SCHEMA_MODEL, getSchemaModel, setSchemaModel } from '../../lib/mapping/index'
import { fail } from '../imports/_lib'

/** Wo das Schema liegen kann — Entwicklung, Auslieferung, Kopie im Serverbuendel. */
const CANDIDATES = [
  'public/schema/avefi/model.schema.json',
  '.output/public/schema/avefi/model.schema.json',
  'server/public/schema/avefi/model.schema.json'
]

/** Ein Enum, an dem sich erkennen laesst, ob ueberhaupt etwas geladen ist. */
const PROBE = 'TitleTypeEnum'

let pending: Promise<SchemaModel> | null = null
let error: string | null = null

async function load(): Promise<SchemaModel> {
  // Hat ein anderer Teil der Anwendung das Schema bereits hinterlegt, gilt seines.
  const current = getSchemaModel()
  if (current.enum(PROBE).length > 0) return current

  const tried: string[] = []
  for (const rel of CANDIDATES) {
    const path = resolve(process.cwd(), rel)
    try {
      const model = createSchemaModel(JSON.parse(await readFile(path, 'utf8')))
      if (model.enum(PROBE).length === 0) {
        tried.push(`${rel}: enthaelt kein ${PROBE}`)
        continue
      }
      setSchemaModel(model)
      error = null
      return model
    } catch (e) {
      tried.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  error = `Das AVefi-Schema konnte nicht geladen werden (${tried.join('; ')}).`
  // Kein Abbruch: ohne Schema bleibt der Editor bedienbar, nur ohne Wertelisten.
  return EMPTY_SCHEMA_MODEL
}

export function schemaModel(): Promise<SchemaModel> {
  if (pending === null) {
    pending = load().catch((e) => {
      error = e instanceof Error ? e.message : String(e)
      pending = null
      return EMPTY_SCHEMA_MODEL
    })
  }
  return pending
}

/** Grund, warum keine Wertelisten vorliegen — oder null, wenn alles da ist. */
export function schemaLoadError(): string | null {
  return error
}

/** Diese Datei ist Hilfsmittel, keine Schnittstelle. */
export default defineEventHandler(() => {
  throw fail(404, 'not_found', {}, 'Keine Schnittstelle.')
})
