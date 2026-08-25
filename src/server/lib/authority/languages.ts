/*
 * Sprach-Nachschlagewerk fuer den language-Konverter.
 *
 * Zielformat ist ISO 639-2/B, der bibliografische Code — das AVefi-Schema
 * erwartet "ger", nicht "deu". Erkannt werden: beide Dreibuchstaben-Codes,
 * der ISO-639-1-Code, die deutsche und die englischen Bezeichnungen sowie die
 * umschriebenen Schreibweisen ohne Umlaute ("franzoesisch").
 *
 * Der Mappingkern hat nur eine kleine Rueckfalltabelle (builtinLanguageCode) und
 * sagt selbst, dass die vollstaendige Tabelle von aussen kommen soll. Das ist
 * diese hier: 487 Eintraege statt neunzehn.
 */

import type { LanguageEntry } from './languages.data.js'
import { LANGUAGE_ENTRIES } from './languages.data.js'
import { compareForm, foldUmlauts } from './names.js'

export type { LanguageEntry }

/**
 * Schreibweisen, die in keiner Codeliste stehen, in Filmlisten aber vorkommen.
 * "zxx" ist der amtliche Code fuer "kein sprachlicher Inhalt" — das ist der
 * Stummfilm.
 */
export const LANGUAGE_EXTRA: Record<string, string> = {
  stumm: 'zxx',
  stummfilm: 'zxx',
  ohne: 'zxx',
  'ohne sprache': 'zxx',
  'ohne ton': 'zxx',
  'kein dialog': 'zxx',
  keine: 'zxx',
  silent: 'zxx',
  'o. spr.': 'zxx',
  'n/a': 'zxx',
  hochdeutsch: 'ger',
  schriftdeutsch: 'ger',
  'deutsch (ot)': 'ger',
  schweizerdeutsch: 'gsw',
  'schweizerdeutsch (mundart)': 'gsw',
  plattdeutsch: 'nds',
  niederdeutsch: 'nds',
  'amerikanisches englisch': 'eng',
  amerikanisch: 'eng',
  britisch: 'eng',
  'britisches englisch': 'eng',
  jiddisch: 'yid',
  hebraeisch: 'heb',
  serbokroatisch: 'hbs',
  'mehrere sprachen': 'mul',
  mehrsprachig: 'mul',
  verschiedene: 'mul',
  unbestimmt: 'und',
  unbekannt: 'und'
}

/** Vergleichsform eines Suchbegriffs — dieselbe wie im Mappingkern. */
export function languageKey(s: string): string {
  return compareForm(s)
}

let index: Map<string, string> | null = null
let byCode: Map<string, LanguageEntry> | null = null

function put(ix: Map<string, string>, key: string, code: string): void {
  const k = languageKey(key)
  if (k === '' || ix.has(k)) return // wer zuerst kommt, gewinnt
  ix.set(k, code)
}

function putWithFold(ix: Map<string, string>, key: string, code: string): void {
  put(ix, key, code)
  const folded = foldUmlauts(key)
  if (folded !== key) put(ix, folded, code)
}

function build(): void {
  const ix = new Map<string, string>()
  const codes = new Map<string, LanguageEntry>()

  // Erst alle Codes — die sind eindeutig und duerfen von keinem Namen verdraengt
  // werden. "no" ist Norwegisch, auch wenn es wie ein Nein aussieht.
  for (const e of LANGUAGE_ENTRIES) {
    codes.set(e.code, e)
    put(ix, e.code, e.code)
    if (e.term !== '') put(ix, e.term, e.code)
    if (e.alpha2 !== '') put(ix, e.alpha2, e.code)
  }

  // Danach die Bezeichnungen.
  for (const e of LANGUAGE_ENTRIES) {
    if (e.de !== '') putWithFold(ix, e.de, e.code)
    for (const en of e.en) putWithFold(ix, en, e.code)
  }

  // Zuletzt die Ergaenzungen; sie ueberschreiben nichts Eindeutiges.
  for (const [from, code] of Object.entries(LANGUAGE_EXTRA)) putWithFold(ix, from, code)

  index = ix
  byCode = codes
}

/**
 * Schlaegt eine Sprachangabe nach und liefert den ISO-639-2/B-Code.
 * Liefert null, wenn die Schreibweise unbekannt ist — was dann geschieht,
 * entscheidet der Konverter.
 */
export function lookupLanguage(value: string): string | null {
  if (index === null) build()
  const key = languageKey(value)
  if (key === '') return null
  return index?.get(key) ?? index?.get(languageKey(foldUmlauts(value))) ?? null
}

/** Der Tabelleneintrag zu einem Code, etwa fuer die Anzeige im Editor. */
export function languageEntry(code: string): LanguageEntry | null {
  if (byCode === null) build()
  return byCode?.get(code.trim().toLowerCase()) ?? null
}

/** Deutsche Bezeichnung zu einem Code, sonst die englische, sonst der Code. */
export function languageLabel(code: string): string {
  const e = languageEntry(code)
  if (e === null) return code
  return e.de !== '' ? e.de : (e.en[0] ?? code)
}

/** Anzahl der Sprachen in der Tabelle. */
export function languageTableSize(): number {
  return LANGUAGE_ENTRIES.length
}

/** Anzahl aller Suchschluessel. */
export function languageKeyCount(): number {
  if (index === null) build()
  return index?.size ?? 0
}

export function allLanguages(): readonly LanguageEntry[] {
  return LANGUAGE_ENTRIES
}
