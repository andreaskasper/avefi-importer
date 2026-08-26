/*
 * Normdaten fuer einen Mappinglauf aufloesen — EINE Stelle fuer Vorschau und
 * Konvertierung.
 *
 * Vorher gab es diese Stelle nicht: Die Vorschau haengte authorityServices()
 * ohne Argument ein (Laender und Sprachen, sonst nichts), der Konvertierungsweg
 * reichte gar keine Dienste herein. Ergebnis war eine Vorschau, die etwas
 * anderes rechnete als der Export — und ein Export ohne Normdatenverknuepfungen
 * und ohne normalisierte Laendernamen.
 *
 * Wer hier vorbeikommt, bekommt darum immer dieselben Einstellungen: dieselbe
 * Schaltervariable, dieselbe Obergrenze, denselben Zwischenspeicher. Bleibt nur
 * ein Unterschied, und der ist gewollt: Die Vorschau darf im Editor nicht
 * minutenlang rechnen und holt deshalb hoechstens PREVIEW_AUTHORITY_LIMIT Werte
 * frisch aus dem Netz. Was sie dabei liegen laesst, sagt sie ueber die
 * Meldung "authority.limit" ausdruecklich an — und beim naechsten Durchlauf
 * steht es im Zwischenspeicher, weil auch Nicht-Treffer dort landen.
 */

import type { Sql } from 'postgres'
import type { AuthorityRequest, MappingServices } from '../mapping/runner.js'
import type { SchemaModel } from '../mapping/schema-model.js'
import type { ResolvedAuthorities } from './resolve.js'
import { authorityEnabledFromEnv, authorityLimitFromEnv, resolveAuthorities } from './resolve.js'
import { dbAuthorityCache, layeredAuthorityCache, memoryAuthorityCache } from './cache.js'
import { authorityServices } from './services.js'

/**
 * So viele Werte holt die Vorschau hoechstens frisch. Der Editor rechnet nach
 * jeder Aenderung neu; bei hundert Namen und der Hoeflichkeitspause zwischen
 * zwei Abfragen waere das eine halbe Minute je Tastendruck.
 */
export const PREVIEW_AUTHORITY_LIMIT = 25

export interface AuthorityRunOptions {
  /**
   * Datenbank fuer den dauerhaften Zwischenspeicher. Ohne sie wird nur im
   * Arbeitsspeicher gemerkt, und jeder Lauf faengt von vorn an.
   */
  sql?: Sql
  schema?: SchemaModel
  /** Obergrenze der Netzabfragen. Ohne Angabe gilt AUTHORITY_LIMIT. */
  limit?: number
  /** Ohne Angabe gilt AUTHORITY_ENABLED; Voreinstellung ist aus. */
  enabled?: boolean
  signal?: AbortSignal
  onWarn?: (message: string) => void
}

/**
 * Loest den gesammelten Bedarf mit den Einstellungen der Umgebung auf.
 *
 * `limit` senkt die Obergrenze, hebt sie aber nie an: Was in AUTHORITY_LIMIT
 * steht, ist die Zusage an den Betreiber und nicht verhandelbar.
 */
export async function resolveForMapping(
  requests: readonly AuthorityRequest[],
  options: AuthorityRunOptions = {}
): Promise<ResolvedAuthorities> {
  const envLimit = authorityLimitFromEnv()
  const limit = options.limit === undefined ? envLimit : Math.min(options.limit, envLimit)

  // Der Arbeitsspeicher liegt vor der Datenbank: Derselbe Name kommt in
  // Kulturdaten hundertfach vor, und eine Datenbankabfrage je Vorkommen waere
  // schon ohne Netz zu viel.
  const memory = memoryAuthorityCache()
  const cache = options.sql === undefined
    ? memory
    : layeredAuthorityCache(
        memory,
        dbAuthorityCache(options.sql, options.onWarn !== undefined ? { onWarn: options.onWarn } : {})
      )

  return resolveAuthorities(requests, {
    enabled: options.enabled ?? authorityEnabledFromEnv(),
    limit,
    cache,
    ...(options.schema !== undefined ? { schema: options.schema } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.onWarn !== undefined ? { onWarn: options.onWarn } : {})
  })
}

/**
 * Dasselbe, aber gleich in der Form, die runRow() erwartet. Die Aufloesung
 * kommt mit zurueck — Meldungen und Zaehlwerte gehoeren in den Bericht.
 */
export async function mappingServicesFor(
  requests: readonly AuthorityRequest[],
  options: AuthorityRunOptions = {}
): Promise<{ services: MappingServices; resolved: ResolvedAuthorities }> {
  const resolved = await resolveForMapping(requests, options)
  return { services: authorityServices(resolved), resolved }
}
