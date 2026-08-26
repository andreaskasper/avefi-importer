/*
 * Die Nachschlagedienste in der Form, die runRow() erwartet.
 *
 * Eigene Datei, damit die Vorab-Aufloesung (pipeline.ts) sie benutzen kann,
 * ohne ueber die Sammelschnittstelle index.ts zu laufen — das waere ein Ring
 * aus Modulen, der sich beim Laden je nach Einstiegspunkt anders verhaelt.
 */

import type { MappingServices } from '../mapping/runner.js'
import type { ResolvedAuthorities } from './resolve.js'
import { lookupCountry } from './countries.js'
import { lookupLanguage } from './languages.js'

/**
 * Ohne Argument sind nur Laender und Sprachen dabei — die brauchen kein Netz und
 * koennen immer eingehaengt werden. Normdaten kommen nur mit, wenn vorher
 * aufgeloest wurde.
 */
export function authorityServices(resolved?: ResolvedAuthorities): MappingServices {
  return {
    lookupCountry,
    lookupLanguage,
    ...(resolved !== undefined ? { resolveAuthority: resolved.resolve } : {})
  }
}
