/*
 * Laender-Nachschlagewerk fuer den country-Konverter.
 *
 * Archivlisten schreiben Laender uneinheitlich: "DE", "DEU", "D", "BRD",
 * "Deutschland", dazu untergegangene Staaten wie "CSSR" oder "DE bis 1945".
 * Die Tabelle fuehrt all das auf einen deutschen Ländernamen samt GND-ID zurueck.
 *
 * Der Konverter gibt den Namen als Wert aus; die GND-ID des Landes wandert ueber
 * den Anreicherungskanal mit, sie ersetzt den Namen nicht.
 *
 * Datenherkunft siehe countries.data.ts. Zur Laufzeit wird nichts nachgeladen —
 * Laendernamen aendern sich selten, und ein Dienst mitten im Worker-Job waere
 * ein Ausfallrisiko ohne Gegenwert.
 */

import type { CountryEntry } from './countries.data.js'
import { COUNTRY_ALIASES, COUNTRY_ENTRIES } from './countries.data.js'
import { foldUmlauts } from './names.js'

export type { CountryEntry }

/** Treffer, wie ihn der Mappingkern erwartet (TransformContext.lookupCountry). */
export interface CountryHit {
  name: string
  gnd: string
  code: string
  historic: boolean
}

/**
 * Eigene Schreibweisen eines Hauses. Wird zuletzt in den Index gelegt und
 * ueberschreibt nichts, was schon eindeutig ist.
 * Schluessel: Schreibweise, Wert: Code eines Eintrags aus COUNTRY_ENTRIES.
 */
export const COUNTRY_EXTRA: Record<string, string> = {
  BRDDR: 'DEU',
  'BUNDESREPUBLIK DEUTSCHLAND': 'DEU',
  'DEUTSCHLAND (WEST)': 'DEU',
  'DEUTSCHLAND (OST)': 'DDR',
  'OST-DEUTSCHLAND': 'DDR',
  OSTDEUTSCHLAND: 'DDR',
  'UNITED STATES': 'USA',
  'UNITED STATES OF AMERICA': 'USA',
  'GREAT BRITAIN': 'GBR',
  'UNITED KINGDOM': 'GBR',
  FRANKREICH: 'FRA',
  OESTERREICH: 'AUT',
  SCHWEIZ: 'CHE'
}

/** Vergleichsform: Grossschreibung, ohne Punkte, Mehrfach-Leerraum zusammengezogen. */
export function countryKey(s: string): string {
  return s.replace(/\./g, '').replace(/\s+/gu, ' ').trim().toUpperCase()
}

let index: Map<string, CountryHit> | null = null

function put(ix: Map<string, CountryHit>, key: string, hit: CountryHit): void {
  const k = countryKey(key)
  if (k === '' || ix.has(k)) return // wer zuerst kommt, gewinnt
  ix.set(k, hit)
}

function buildIndex(): Map<string, CountryHit> {
  const ix = new Map<string, CountryHit>()
  const byCode = new Map<string, CountryHit>()

  // 1. Codes und Namen der Eintraege selbst.
  for (const e of COUNTRY_ENTRIES) {
    const hit: CountryHit = { name: e.name, gnd: e.gnd, code: e.code, historic: e.historic }
    if (!byCode.has(e.code)) byCode.set(e.code, hit)
    put(ix, e.code, hit)
    if (e.alpha2 !== '') put(ix, e.alpha2, hit)
    put(ix, e.name, hit)
    // "Grossbritannien" neben "Großbritannien", "Aegypten" neben "Ägypten".
    const folded = foldUmlauts(e.name)
    if (folded !== e.name) put(ix, folded, hit)
  }

  // 2. Aliase aus der Tabelle, danach die Ergaenzungen des Hauses.
  for (const [from, to] of Object.entries({ ...COUNTRY_ALIASES, ...COUNTRY_EXTRA })) {
    const hit = byCode.get(countryKey(to))
    if (hit !== undefined) put(ix, from, hit)
  }

  return ix
}

/**
 * Schlaegt eine Laenderangabe nach. Liefert null, wenn die Schreibweise
 * unbekannt ist — was damit geschieht, entscheidet der Konverter (unveraendert
 * uebernehmen, verwerfen oder beanstanden).
 */
export function lookupCountry(value: string): CountryHit | null {
  if (index === null) index = buildIndex()
  const key = countryKey(value)
  if (key === '') return null
  return index.get(key) ?? index.get(countryKey(foldUmlauts(value))) ?? null
}

/** Anzahl der Laendereintraege (ohne Aliase) — fuer Tests und Anzeige. */
export function countryTableSize(): number {
  return COUNTRY_ENTRIES.length
}

/** Anzahl aller Suchschluessel einschliesslich Aliasen. */
export function countryKeyCount(): number {
  if (index === null) index = buildIndex()
  return index.size
}

/** Alle Eintraege — fuer eine Uebersicht im Editor. */
export function allCountries(): readonly CountryEntry[] {
  return COUNTRY_ENTRIES
}
