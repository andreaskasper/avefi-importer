/*
 * TableHeader — Normalisierung der Kopfzeile einer tabellarischen Quelle und der
 * Header-Hash, unter dem ein Mappingprofil gefunden wird.
 *
 * Der Hash laeuft ueber die normalisierten, SORTIERTEN Spaltennamen plus
 * Basisformat. Sortiert, weil das Mapping Spalten ueber ihren NAMEN adressiert:
 * Exportiert dieselbe Institution naechstes Jahr dieselben Spalten in anderer
 * Reihenfolge, greift das Profil weiterhin. Bei Adressierung ueber den Index
 * waere Sortieren gefaehrlich — ein umsortierter Export wuerde still falsch
 * gemappt.
 *
 * Umlaute bleiben erhalten: "Laenge" und "Lange" sind verschiedene Spalten.
 *
 * Hier wird nichts von der Platte gelesen. Das Zerlegen der Datei erledigt der
 * Leser des jeweiligen Formats; diese Datei bekommt fertige Zellen.
 */

import { createHash } from 'node:crypto'
import type { BaseFormat } from '#shared/types/domain'

/** Zeile einer Quelle nach dem Zerlegen: Spaltenname -> Rohwert. */
export type SourceRow = Record<string, string>

/** BOM weg, Rand trimmen, Mehrfach-Leerraum zusammenziehen. */
export function cleanHeader(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\s+/gu, ' ').trim()
}

/** Vergleichsform eines Spaltennamens (Kleinschreibung, Umlaute bleiben stehen). */
export function normalizeHeader(raw: string): string {
  return cleanHeader(raw).toLowerCase()
}

/**
 * Macht Spaltennamen eindeutig: zwei Spalten "Titel" werden zu "Titel" und
 * "Titel (2)". Bei Namensadressierung waere die zweite sonst nicht erreichbar.
 * Namenlose Spalten bekommen "Spalte N".
 */
export function dedupeColumns(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  const out: string[] = []

  names.forEach((rawName, index) => {
    let name = cleanHeader(rawName)
    if (name === '') name = `Spalte ${index + 1}`
    const key = name.toLowerCase()

    const hits = seen.get(key)
    if (hits === undefined) {
      seen.set(key, 1)
      out.push(name)
      return
    }

    let n = hits + 1
    let candidate = `${name} (${n})`
    while (seen.has(candidate.toLowerCase())) {
      n++
      candidate = `${name} (${n})`
    }
    seen.set(key, n)
    seen.set(candidate.toLowerCase(), 1)
    out.push(candidate)
  })

  return out
}

/**
 * Byteweiser Vergleich zweier Zeichenketten in UTF-8.
 * PHPs sort(..., SORT_STRING) vergleicht Bytes; damit derselbe Hash entsteht,
 * wird hier ebenso verglichen und nicht nach Gebietsschema sortiert.
 */
function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/** md5 ueber normalisierte, sortierte Spaltennamen plus Basisformat. */
export function headerHash(columns: readonly string[], baseFormat: BaseFormat | null | undefined): string {
  const normalized = columns.map((c) => normalizeHeader(c)).sort(compareUtf8)
  return createHash('md5').update(`${baseFormat ?? ''}|${normalized.join(',')}`).digest('hex')
}

/** Ist die Zeile durchgehend leer? Solche Zeilen zaehlen nicht als Datensatz. */
export function isEmptyRow(row: SourceRow): boolean {
  for (const value of Object.values(row)) {
    if (String(value ?? '').trim() !== '') return false
  }
  return true
}

/** Ergebnis der Kopfzeilen-Auswertung. */
export interface HeaderInfo {
  /** Entdoppelte, bereinigte Spaltennamen — so adressiert das Mapping. */
  columns: string[]
  /** Die Namen, wie sie in der Datei stehen (nur bereinigt, nicht entdoppelt). */
  rawColumns: string[]
  hash: string
}

/** Bereitet eine gelesene Kopfzeile auf und bildet den Hash. */
export function buildHeader(rawCells: readonly string[], baseFormat: BaseFormat | null): HeaderInfo {
  const rawColumns = rawCells.map((c) => cleanHeader(String(c ?? '')))
  const columns = dedupeColumns(rawColumns)
  return { columns, rawColumns, hash: headerHash(columns, baseFormat) }
}

/** Wandelt Zellenlisten in benannte Zeilen; fehlende Zellen werden leer. */
export function rowsFromCells(columns: readonly string[], cellRows: readonly (readonly string[])[]): SourceRow[] {
  const out: SourceRow[] = []
  for (const cells of cellRows) {
    const row: SourceRow = {}
    columns.forEach((name, i) => {
      row[name] = String(cells[i] ?? '')
    })
    if (!isEmptyRow(row)) out.push(row)
  }
  return out
}

/**
 * Abgleich zweier Spaltenlisten ueber die Vergleichsform.
 * matched  in beiden vorhanden (mit dem Namen der Kopfzeile)
 * missing  im Profil beschrieben, in der Kopfzeile nicht vorhanden
 * extra    in der Kopfzeile vorhanden, im Profil nicht beschrieben
 */
export interface ColumnDiff {
  matched: string[]
  missing: string[]
  extra: string[]
  /** Vermutete Umbenennungen: fehlende Profilspalte -> aehnliche neue Spalte. */
  renamed: Array<{ from: string; to: string; similarity: number }>
}

/**
 * Aehnlichkeit zweier Spaltennamen zwischen 0 und 1, gebildet ueber die
 * Zeichenpaare beider Namen (Dice-Koeffizient). Reicht, um "Regie" und
 * "Regisseur" als Umbenennungsverdacht zu erkennen, ohne bei "Ton" und "Sound"
 * etwas zu behaupten.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeHeader(a)
  const right = normalizeHeader(b)
  if (left === '' || right === '') return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0

  const pairs = (s: string): string[] => {
    const out: string[] = []
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
    return out
  }
  const a2 = pairs(left)
  const b2 = pairs(right)
  const pool = [...b2]
  let hits = 0
  for (const p of a2) {
    const at = pool.indexOf(p)
    if (at >= 0) {
      pool.splice(at, 1)
      hits++
    }
  }
  return (2 * hits) / (a2.length + b2.length)
}

/** Ab dieser Aehnlichkeit gilt eine Spalte als moeglicherweise umbenannt. */
export const RENAME_THRESHOLD = 0.6

/**
 * Vergleicht die im Profil beschriebenen Spalten mit der tatsaechlichen
 * Kopfzeile. Das Ergebnis ist zur Anzeige gedacht: Die Oberflaeche soll sagen
 * koennen, welche Spalte fehlt, welche neu ist und welche vermutlich nur
 * umbenannt wurde.
 */
export function diffColumns(profileColumns: readonly string[], actualColumns: readonly string[]): ColumnDiff {
  const actualByNorm = new Map<string, string>()
  for (const c of actualColumns) actualByNorm.set(normalizeHeader(c), c)

  const matched: string[] = []
  const missing: string[] = []
  const usedNorms = new Set<string>()

  for (const p of profileColumns) {
    const key = normalizeHeader(p)
    const hit = actualByNorm.get(key)
    if (hit !== undefined) {
      matched.push(hit)
      usedNorms.add(key)
    } else {
      missing.push(p)
    }
  }

  const extra = actualColumns.filter((c) => !usedNorms.has(normalizeHeader(c)))

  // Umbenennungsverdacht nur zwischen dem, was uebrig bleibt.
  const renamed: ColumnDiff['renamed'] = []
  const takenExtras = new Set<string>()
  for (const from of missing) {
    let best: { to: string; similarity: number } | null = null
    for (const to of extra) {
      if (takenExtras.has(to)) continue
      const similarity = nameSimilarity(from, to)
      if (similarity >= RENAME_THRESHOLD && (best === null || similarity > best.similarity)) {
        best = { to, similarity }
      }
    }
    if (best !== null) {
      takenExtras.add(best.to)
      renamed.push({ from, to: best.to, similarity: best.similarity })
    }
  }

  return { matched, missing, extra, renamed }
}
