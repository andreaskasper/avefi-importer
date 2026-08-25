/*
 * Anzeigelabel fuer den Format-Hinweis in der Importliste.
 *
 * Der Wert ist reine Anzeige. Entschieden wird anhand von Kopfzeile bzw.
 * Struktur, nicht anhand dieses Textes.
 */
import type { BaseFormat, FormatDetail } from '#shared/types/domain'
import type { Analysis } from './fingerprint'

/** Spaltennamen, an denen eine Objektliste erkennbar ist. */
const TITLE_HINTS = [
  'titel', 'haupttitel', 'originaltitel', 'filmtitel', 'werktitel',
  'title', 'maintitle', 'original title', 'name'
]

export function hasTitleColumn(columns: readonly string[]): boolean {
  return columns.some((c) => TITLE_HINTS.includes(c.trim().toLowerCase()))
}

export interface SchemaGuess {
  label: string
  /** Passender Konverterschluessel oder null. */
  key: string | null
}

/** Struktur eines JSON-Dokuments deuten. */
export function guessJsonSchema(columns: readonly string[], sample: unknown): SchemaGuess {
  const cols = columns.map((c) => c.toLowerCase())
  const first = Array.isArray(sample) ? sample[0] : null
  const category =
    first !== null && typeof first === 'object' ? String((first as Record<string, unknown>).category ?? '') : ''

  if (category.startsWith('avefi:') || any(cols, ['has_primary_title', 'has_record', 'is_manifestation_of', 'is_item_of'])) {
    return { label: 'AVefi (nativ)', key: 'avefi_json_v1' }
  }
  if (any(cols, ['leader', 'fields', 'controlfield', 'datafield'])) return { label: 'MARC-in-JSON', key: null }
  if (any(cols, ['lido', 'lidorecid', 'descriptivemetadata'])) return { label: 'LIDO-JSON', key: null }
  if (any(cols, ['dc:title', 'dcterms:title', 'identifier.dc'])) return { label: 'Dublin-Core-JSON', key: null }
  if (hasTitleColumn(columns)) return { label: 'Objektliste (JSON)', key: 'generic_json_v1' }
  return { label: 'JSON (Struktur unbekannt)', key: null }
}

/**
 * Label fuer die Uebersicht.
 * Ein unbekanntes Basisformat wird als unbekannt bezeichnet und nicht mehr
 * stillschweigend als XML gefuehrt.
 */
export function describeFormat(baseFormat: BaseFormat | null, analysis: Analysis, parseOk = true): string {
  switch (baseFormat) {
    case 'json':
      return parseOk ? guessJsonSchema(analysis.columns, analysis.sample).label : 'JSON (fehlerhaft)'
    case 'csv':
    case 'tsv':
      return baseFormat.toUpperCase() + (analysis.columns.length ? ` · ${analysis.columns.length} Spalten` : '')
    case 'xlsx':
      return 'Excel-Arbeitsmappe'
    case 'xml':
    case 'ead':
    case 'marcxml':
      return parseOk ? xmlLabel(baseFormat, analysis) : 'XML (fehlerhaft)'
    default:
      return 'Format unbekannt'
  }
}

/**
 * Dieselbe Aussage wie describeFormat(), aber in Bestandteilen.
 *
 * describeFormat() liefert einen fertigen deutschen Satz und bleibt so, weil er
 * in der Datenbank steht. Fuer die Anzeige braucht es die Teile, damit die
 * Oberflaeche den Satz uebersetzt bilden kann. Bei Formaten ohne Zaehlung ist
 * der Formatname bereits die ganze Aussage.
 */
export function formatDetail(
  baseFormat: BaseFormat | null,
  analysis: Analysis,
  parseOk = true
): FormatDetail {
  if ((baseFormat === 'csv' || baseFormat === 'tsv') && analysis.columns.length > 0) {
    return { format: baseFormat.toUpperCase(), columns: analysis.columns.length }
  }
  return { format: describeFormat(baseFormat, analysis, parseOk) }
}

function xmlLabel(baseFormat: BaseFormat | null, analysis: Analysis): string {
  const s = (analysis.sample ?? {}) as { root?: string; namespace?: string }
  const root = String(s.root ?? '').toLowerCase()
  const ns = String(s.namespace ?? '').toLowerCase()
  const children = analysis.columns.map((c) => c.toLowerCase())

  if (baseFormat === 'marcxml' || ns.includes('marc21') || root === 'record' || (root === 'collection' && children.includes('record'))) {
    return 'MARC-XML'
  }
  if (baseFormat === 'ead' || root === 'ead' || children.includes('archdesc') || children.includes('eadheader')) return 'EAD'
  if (ns.includes('lido') || root === 'lido' || root === 'lidowrap') return 'LIDO'
  // Excel 2003 speichert als XML mit <workbook> — sonst laesst sich nicht
  // erklaeren, warum eine Tabelle als XML gemeldet wird.
  if (root === 'workbook') return 'XML-Arbeitsmappe (Excel 2003)'
  return root !== '' ? `XML: <${root}>` : 'XML'
}

function any(haystack: readonly string[], needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}

/**
 * Waehlt einen Konverter, wenn die Quelle ohne Mappingprofil verarbeitbar ist.
 * Tabellen sind hier nicht dabei: Sie laufen immer ueber den Kopfzeilen-Hash.
 */
export function genericConverterKey(baseFormat: BaseFormat | null, analysis: Analysis): string | null {
  if (baseFormat === 'json') {
    const guess = guessJsonSchema(analysis.columns, analysis.sample)
    if (guess.key !== null) return guess.key
    return null
  }

  const s = (analysis.sample ?? {}) as { root?: string; namespace?: string }
  const root = String(s.root ?? '').toLowerCase()
  const ns = String(s.namespace ?? '').toLowerCase()
  const children = analysis.columns.map((c) => c.toLowerCase())

  if (baseFormat === 'marcxml' || ns.includes('marc21') || root === 'record' || (root === 'collection' && children.includes('record'))) {
    return 'marcxml_v1'
  }
  if (baseFormat === 'ead' || root === 'ead' || children.includes('archdesc') || children.includes('eadheader')) {
    return 'ead_v1'
  }
  return null
}
