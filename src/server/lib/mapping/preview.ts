/*
 * MappingPreview — Vorschau des Mappingeditors und die Stichprobe des Profils.
 *
 * Die Vorschau zeigt je Quellspalte bis zu drei Beispiele. Sie werden GEZIELT
 * gesucht, statt einfach die ersten Zeilen zu nehmen: In einer der Testlisten ist
 * das Produktionsjahr in der ersten Zeile leer und die Regie in den ersten drei —
 * eine an Zeile 1 klebende Vorschau zeigt dort nichts und sieht aus, als sei die
 * Zuordnung kaputt. Gesucht werden deshalb je Spalte die ersten drei
 * VERSCHIEDENEN gefuellten Werte; bei Wertelisten ist das zugleich die Antwort
 * auf die Frage, ob die Zuordnung alle vorkommenden Schreibweisen abdeckt.
 *
 * Gerechnet wird nur die Vereinigungsmenge der dafuer noetigen Zeilen (gedeckelt),
 * nicht die ganze Stichprobe. Die Belegung je Spalte ("gefuellt in 57 von 77
 * Zeilen") faellt aus derselben Rechnung ab und wird mitgeliefert.
 */

import type { MappingJson, ProfileSample } from '#shared/types/domain'
import { meldungstext } from './meldungen.js'
import type { MappingMessage } from '#shared/types/domain'
import type { SourceRow } from './header.js'
import type { AvefiRecord } from './builder.js'
import type { CellResult, MappingCheck, MappingFixPart, MappingServices } from './runner.js'
import { canonicalOp, runChain } from './transform.js'
import { getTarget } from './targets.js'
import { runRow, staticCheck } from './runner.js'

/** Obergrenze gerechneter Zeilen. */
export const MAX_PREVIEW_ROWS = 60
/** Beispiele je Spalte. */
export const EXAMPLES_PER_COLUMN = 3

/**
 * Wie viele verschiedene Werte je Spalte die Stichprobe des Profils fuehrt.
 *
 * Frueher 60. Die Stichprobe ist aber nicht nur Anschauungsmaterial fuer die
 * Vorschau, sondern die Arbeitsliste der Normdatenzuordnung: Was hier fehlt,
 * kann niemand von Hand entscheiden.
 */
export const SAMPLE_DISTINCT_LIMIT = 200
/** Verschiedene Schema-Beanstandungen im Bericht. */
export const MAX_SCHEMA_ISSUES = 25

export interface ColumnExample {
  /** Zeilennummer, 0-basiert im uebergebenen Zeilenfeld. */
  row: number
  raw: string
  /** Wie oft dieser Wert in der Stichprobe vorkommt. */
  count: number
}

export interface ColumnExamples {
  /** In wie vielen der betrachteten Zeilen ist die Spalte gefuellt? */
  filled: number
  examples: ColumnExample[]
}

/**
 * Je Spalte die ersten Beispiele mit verschiedenen gefuellten Werten samt
 * Zeilennummer und Haeufigkeit, dazu die Zahl der gefuellten Zeilen.
 *
 * Die Haeufigkeit wird weitergezaehlt, auch wenn schon genug Beispiele
 * beisammen sind — sonst stimmte die Belegung nicht.
 */
export function pickExamples(
  columns: readonly string[],
  rows: readonly SourceRow[],
  perColumn = EXAMPLES_PER_COLUMN
): Record<string, ColumnExamples> {
  const out: Record<string, ColumnExamples> = {}

  for (const col of columns) {
    let filled = 0
    const seen = new Map<string, number>()
    const examples: ColumnExample[] = []

    rows.forEach((row, i) => {
      const raw = String(row[col] ?? '').trim()
      if (raw === '') return
      filled++
      const at = seen.get(raw)
      if (at !== undefined) {
        const e = examples[at]
        if (e !== undefined) e.count++
        return
      }
      if (examples.length >= perColumn) return // weiterzaehlen, nicht abbrechen
      seen.set(raw, examples.length)
      examples.push({ row: i, raw, count: 1 })
    })

    out[col] = { filled, examples }
  }

  return out
}

/**
 * Stichprobe fuers Profil: Beispielwerte mit Haeufigkeit und Belegung je Spalte.
 * Das ist genau die Rechnung der Vorschau, nur ohne das Mapping anzuwenden.
 */
export function buildProfileSample(
  columns: readonly string[],
  rows: readonly SourceRow[],
  options: { totalRows?: number; sampleRows?: number; distinctPerColumn?: number } = {}
): ProfileSample {
  const total = options.totalRows ?? rows.length
  const sampleRows = options.sampleRows ?? 25
  const perColumn = options.distinctPerColumn ?? SAMPLE_DISTINCT_LIMIT

  const values: Record<string, Array<{ value: string; count: number }>> = {}
  const coverage: Record<string, { filled: number; total: number }> = {}

  for (const col of columns) {
    const counts = new Map<string, number>()
    let filled = 0
    for (const row of rows) {
      const v = String(row[col] ?? '').trim()
      if (v === '') continue
      filled++
      const known = counts.get(v)
      if (known !== undefined) counts.set(v, known + 1)
      else if (counts.size < perColumn) counts.set(v, 1)
    }
    values[col] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }))
    coverage[col] = { filled, total }
  }

  return {
    columns: [...columns],
    rows: rows.slice(0, sampleRows).map((r) => columns.map((c) => String(r[c] ?? ''))),
    values,
    coverage
  }
}

/* ---------------------------------------------------------------- Vorschau */

export interface PreviewColumn {
  examples: Array<ColumnExample & { pre: string; outputs: CellResult['outputs']; errors: MappingMessage[] }>
  /** n von of betrachteten Zeilen gefuellt; total ist die Zeilenzahl der Datei. */
  filled: { n: number; of: number; total: number }
}

export interface PreviewResult {
  columns: Record<string, PreviewColumn>
  /** Ein vollstaendig gerechneter Datensatz fuer die Strukturansicht. */
  canonical: AvefiRecord | null
  /** Beanstandungen der Schemapruefung, nach Haeufigkeit sortiert. */
  schema: Array<{ message: string; rows: number }>
  evaluatedRows: number
  checks: MappingCheck[]
  /** Belegung je Spalte, direkt fuer ProfileSample.coverage verwendbar. */
  coverage: Record<string, { filled: number; total: number }>
}

export interface PreviewInput {
  columns: readonly string[]
  rows: readonly SourceRow[]
  /** Zeilenzahl der ganzen Datei, falls groesser als die Stichprobe. */
  rowCount?: number
}

export interface PreviewOptions extends MappingServices {
  maxRows?: number
  perColumn?: number
  /**
   * Schemapruefung eines fertigen Datensatzes. Sie liegt ausserhalb der
   * Mappinglogik; ohne sie bleibt die Liste leer.
   */
  validateRecord?: (record: AvefiRecord) => string[]
}

/**
 * Welche Zeilen die Vorschau rechnet.
 *
 * Eigene Funktion, weil der Aufrufer sie braucht: Der Normdatenbedarf muss VOR
 * dem Rechnen aufgeloest werden, und zwar fuer GENAU diese Zeilen. Wuerde die
 * Auswahlregel an zwei Orten stehen, waeren es zwei Orte, an denen sie
 * auseinanderlaufen kann — und die Vorschau zeigte Normdaten zu Zeilen, die sie
 * gar nicht rechnet.
 */
export function previewRowIndices(
  input: PreviewInput,
  options: { maxRows?: number; perColumn?: number } = {}
): number[] {
  const maxRows = options.maxRows ?? MAX_PREVIEW_ROWS
  const perColumn = options.perColumn ?? EXAMPLES_PER_COLUMN
  const picked = pickExamples([...input.columns], [...input.rows], perColumn)

  // Zeile 0 ist immer dabei: Sie liefert die Strukturvorschau — der AVefi-Baum
  // soll einen vollstaendigen Datensatz zeigen, nicht einen aus Bruchstuecken.
  const needed = new Set<number>()
  if (input.rows.length > 0) needed.add(0)
  for (const info of Object.values(picked)) {
    for (const e of info.examples) needed.add(e.row)
  }
  return [...needed].slice(0, maxRows).sort((a, b) => a - b)
}

/** Dieselben Zeilen, gleich als Zeilen statt als Nummern. */
export function previewRows(
  input: PreviewInput,
  options: { maxRows?: number; perColumn?: number } = {}
): SourceRow[] {
  const rows = [...input.rows]
  return previewRowIndices(input, options)
    .map((i) => rows[i])
    .filter((r): r is SourceRow => r !== undefined)
}

/** Baut die Vorschau: Beispiele, gerechnete Ergebnisse, Hinweise. */
export function buildPreview(
  input: PreviewInput,
  mapping: MappingJson,
  options: PreviewOptions = {}
): PreviewResult {
  const columns = [...input.columns]
  const rows = [...input.rows]
  const total = input.rowCount ?? rows.length
  const perColumn = options.perColumn ?? EXAMPLES_PER_COLUMN

  const picked = pickExamples(columns, rows, perColumn)
  const indices = previewRowIndices(input, {
    ...(options.maxRows !== undefined ? { maxRows: options.maxRows } : {}),
    perColumn
  })

  const services: MappingServices = {
    ...(options.schema !== undefined ? { schema: options.schema } : {}),
    ...(options.resolveAuthority !== undefined ? { resolveAuthority: options.resolveAuthority } : {}),
    ...(options.lookupCountry !== undefined ? { lookupCountry: options.lookupCountry } : {}),
    ...(options.lookupLanguage !== undefined ? { lookupLanguage: options.lookupLanguage } : {})
  }

  const evaluated = new Map<number, Record<string, CellResult>>()
  let canonical: AvefiRecord | null = null
  const schemaTally = new Map<string, number>()
  const runtimeChecks: MappingCheck[] = []

  for (const idx of indices) {
    const row = rows[idx]
    if (row === undefined) continue
    const result = runRow(mapping, row, `vorschau${idx + 1}`, services, idx + 1)
    evaluated.set(idx, result.cells)
    runtimeChecks.push(...result.issues)
    if (canonical === null) canonical = result.canonical

    for (const message of options.validateRecord?.(result.canonical) ?? []) {
      schemaTally.set(message, (schemaTally.get(message) ?? 0) + 1)
    }
  }

  const out: Record<string, PreviewColumn> = {}
  const coverage: Record<string, { filled: number; total: number }> = {}

  for (const col of columns) {
    const info = picked[col] ?? { filled: 0, examples: [] }
    out[col] = {
      examples: info.examples.map((e) => {
        const cell = evaluated.get(e.row)?.[col]
        return {
          ...e,
          pre: cell?.pre ?? '',
          outputs: cell?.outputs ?? [],
          errors: (cell?.errors ?? []).map((e) => ({ ...e, text: meldungstext(e) }))
        }
      }),
      filled: { n: info.filled, of: rows.length, total }
    }
    coverage[col] = { filled: info.filled, total: rows.length }
  }

  const schema = [...schemaTally.entries()]
    .map(([message, count]) => ({ message, rows: count }))
    .sort((a, b) => b.rows - a.rows)
    .slice(0, MAX_SCHEMA_ISSUES)

  const checks = [
    ...staticCheck(mapping, options.schema),
    ...dedupeChecks(runtimeChecks),
    ...dataChecks(mapping, out),
    ...bracketTitleChecks(mapping, out),
    ...branchBalance(mapping, evaluated)
  ]

  return { columns: out, canonical, schema, evaluatedRows: indices.length, checks, coverage }
}

/** Gleiche Beanstandung aus mehreren Zeilen nur einmal zeigen. */
function dedupeChecks(checks: readonly MappingCheck[]): MappingCheck[] {
  const seen = new Set<string>()
  const out: MappingCheck[] = []
  for (const c of checks) {
    const key = `${c.code ?? ''}|${c.sourceField ?? ''}|${c.targetField ?? ''}|${c.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/**
 * Hinweise, die erst an den Daten sichtbar werden. Die statische Analyse kennt
 * die Werte nicht: Dass in "Land" ein Schraegstrich steht und damit zwei Laender
 * gemeint sind, sieht man erst hier.
 */
/**
 * Titel in eckigen Klammern.
 *
 * In der Katalogpraxis vieler Haeuser steht ein Titel in eckigen Klammern,
 * wenn das Archiv ihn selbst vergeben hat, weil der Film keinen eigenen
 * traegt. Im AVefi-Schema ist dafuer der Typ SuppliedDevisedTitle vorgesehen,
 * und der LIDO-Konverter wertet die Klammer bereits so aus.
 *
 * Im CSV-Weg darf daraus keine feste Regel werden. Dort fehlt der Kontext des
 * liefernden Hauses: Klammern stehen auch fuer Unsicherheit und fuer Zusaetze
 * in einem sonst echten Titel. Deshalb ist das hier ein Vorschlag, den ein
 * Mensch annimmt oder ablehnt — und der angenommen im Profil sichtbar bleibt
 * und mit ihm zur naechsten Testperson reist.
 *
 * Das Muster ist auf den ganzen Wert verankert. "Der blaue Engel [Fragment]"
 * ist ein Haupttitel mit einem Zusatz; ein unverankertes Muster wuerde ihn zum
 * Archivtitel umdeuten.
 */
const KLAMMERTITEL = /^\[.*\]$/u

function isBracketed(raw: string): boolean {
  return KLAMMERTITEL.test(raw.trim())
}

/**
 * Vorschlaege fuer eingeklammerte Titel.
 *
 * Zwei Lagen, zwei verschiedene Vorschlaege:
 *
 *  - Alle Werte eingeklammert: Die Spalte ist durchgehend ein Archivtitel.
 *    Dann braucht es keine Verzweigung, sondern nur das richtige Ziel.
 *  - Gemischt: Nur ein Teil ist eingeklammert. Dann muss die Spalte sich
 *    aufteilen, und das geht erst mit dem Waechter "Nur wenn".
 */
/**
 * Bilanz der Zweige einer Spalte.
 *
 * Der Waechter "Nur wenn" verwirft still — anders liesse sich mit ihm keine
 * Verzweigung bauen, denn in einem Zweigpaar passt eine Seite naturgemaess
 * nie. Die Sichtbarkeit muss deshalb woanders herkommen, und zwar als
 * Summe statt je Zeile.
 *
 * Gezaehlt wird ueber die Zeilen, die die Vorschau tatsaechlich rechnet, nicht
 * ueber die ganze Datei — dieselbe Stichprobe, aus der auch die Beispiele
 * stammen. Der Satz sagt das ausdruecklich, sonst laesen sich die Zahlen als
 * Gesamtbilanz.
 *
 * Die dritte Zahl ist die wichtige. Sie ist null, solange die Muster
 * komplementaer sind. Alles andere heisst: Es gibt Werte, die durch alle
 * Zweige fallen, und die stehen hinterher nirgends im Datensatz. Genau der
 * Verlust, den ein stiller Waechter sonst verstecken wuerde.
 *
 * Gezeigt wird die Bilanz nur, wo jemand tatsaechlich einen Waechter gesetzt
 * hat. Eine gewoehnliche Verzweigung schreibt absichtlich in alle Ziele; dort
 * waere die Aufstellung kein Befund, sondern Laerm.
 */
export function branchBalance(
  mapping: MappingJson,
  evaluated: ReadonlyMap<number, Record<string, CellResult>>
): MappingCheck[] {
  const out: MappingCheck[] = []

  for (const [col, spec] of Object.entries(mapping.columns ?? {})) {
    if (typeof spec !== 'object' || spec === null || spec.ignore === true) continue
    const bindings = spec.targets ?? []
    if (bindings.length < 2) continue

    const pre = Array.isArray(spec.pre) ? spec.pre : []
    const hatWaechter = bindings.some((b) => [...pre, ...(Array.isArray(b.post) ? b.post : [])]
      .some((st) => canonicalOp(String(st?.op ?? '')) === 'only'))
    if (!hatWaechter) continue

    const treffer = new Map<string, number>()
    let ohne = 0
    let zeilen = 0
    for (const cells of evaluated.values()) {
      const cell = cells[col]
      if (cell === undefined || cell.raw.trim() === '') continue
      zeilen++
      const ziele = new Set(
        cell.outputs.filter((o) => String(o.value).trim() !== '').map((o) => o.target)
      )
      if (ziele.size === 0) {
        ohne++
        continue
      }
      for (const z of ziele) treffer.set(z, (treffer.get(z) ?? 0) + 1)
    }
    if (zeilen === 0) continue

    const verteilung = bindings
      .map((b) => {
        const key = String(b.target ?? '')
        return `${getTarget(key)?.label ?? key}: ${treffer.get(key) ?? 0}`
      })
      .join(', ')

    out.push({
      severity: ohne > 0 ? 'warning' : 'info',
      code: ohne > 0 ? 'data.branchGap' : 'data.branchBalance',
      sourceField: col,
      params: { verteilung, ohne, zeilen },
      message: ohne > 0
        ? `Aufteilung der Spalte in den ${zeilen} betrachteten Zeilen: ${verteilung}. ${ohne} davon `
          + 'haben keinen Zweig getroffen und stehen daher in keinem Datensatz. Die Muster decken '
          + 'nicht alle Werte ab.'
        : `Aufteilung der Spalte in den ${zeilen} betrachteten Zeilen: ${verteilung}. Jede davon `
          + 'wurde einem Zweig zugeordnet.'
    })
  }

  return out
}

export function bracketTitleChecks(
  mapping: MappingJson,
  columns: Record<string, PreviewColumn>
): MappingCheck[] {
  const out: MappingCheck[] = []

  for (const [col, spec] of Object.entries(mapping.columns ?? {})) {
    if (typeof spec !== 'object' || spec === null || spec.ignore === true) continue
    const examples = columns[col]?.examples ?? []
    const gefuellt = examples.filter((e) => e.raw.trim() !== '')
    if (gefuellt.length < 2) continue
    const geklammert = gefuellt.filter((e) => isBracketed(e.raw)).length
    if (geklammert === 0) continue

    const abgelehnt = Array.isArray(spec.dismissed) ? spec.dismissed : []
    const pre = Array.isArray(spec.pre) ? spec.pre : []

    for (const binding of spec.targets ?? []) {
      const key = String(binding.target ?? '')
      const target = getTarget(key)
      // Nur der einwertige Primaerplatz ist betroffen. An einem mehrwertigen
      // Ziel draengen sich zwei Titel nicht gegenseitig weg.
      if (target === undefined || target.writer.kind !== 'title' || !target.writer.primary) continue
      if (target.writer.titleType === 'SuppliedDevisedTitle') continue

      const ersatz = `${target.level}.title.supplied`
      if (getTarget(ersatz) === undefined) continue
      const alle = geklammert === gefuellt.length
      const code = alle ? 'data.bracketTitleAll' : 'data.bracketTitle'
      if (abgelehnt.some((d) => d.code === code && d.target === key)) continue

      // Wer schon einen Waechter oder eine Klammerbehandlung in der Kette hat,
      // hat die Entscheidung getroffen.
      const kette = [...pre, ...(Array.isArray(binding.post) ? binding.post : [])]
      if (kette.some((st) => canonicalOp(String(st?.op ?? '')) === 'only')) continue
      if (kette.some((st) => String(st?.pattern ?? '').includes('\\['))) continue

      const fixPlan: MappingFixPart[] = alle
        ? [{
            target: ersatz,
            replaces: key,
            post: [{ op: 'regex', pattern: '^\\[(.*)\\]$', capture: 1 }]
          }]
        : [
            { target: key, post: [{ op: 'only', pattern: '^\\[.*\\]$', negate: true }] },
            { target: ersatz, post: [{ op: 'only', pattern: '^\\[(.*)\\]$', capture: 1 }] }
          ]

      out.push({
        severity: 'warning',
        code,
        sourceField: col,
        targetField: key,
        params: { n: geklammert, von: gefuellt.length, label: target.label, typ: target.writer.titleType },
        message: alle
          ? `Alle betrachteten Werte stehen in eckigen Klammern. In vielen Katalogen heisst das: `
            + `vom Archiv vergebener Titel. Als "${target.label}" bekommen sie den Typ `
            + `${target.writer.titleType}; als Archivtitel bekommen sie SuppliedDevisedTitle, `
            + 'und die Klammern fallen weg.'
          : `${geklammert} von ${gefuellt.length} betrachteten Werten stehen in eckigen Klammern, `
            + 'die uebrigen nicht. Eingeklammerte Titel sind in vielen Katalogen vom Archiv '
            + 'vergeben. Die Spalte laesst sich aufteilen: eingeklammerte Werte als Archivtitel, '
            + 'alle anderen bleiben, wo sie sind.',
        fixLabel: alle ? 'mapping.check.fixBracketAll' : 'mapping.check.fixBracketSplit',
        fixPlan
      })
      break
    }
  }

  return out
}

export function dataChecks(mapping: MappingJson, columns: Record<string, PreviewColumn>): MappingCheck[] {
  const separators: ReadonlyArray<readonly [string, string]> = [
    [';', 'Semikolon'],
    ['/', 'Schraegstrich'],
    [',', 'Komma']
  ]
  const out: MappingCheck[] = []

  for (const [col, spec] of Object.entries(mapping.columns ?? {})) {
    if (typeof spec !== 'object' || spec === null || spec.ignore === true) continue
    const examples = columns[col]?.examples ?? []
    if (examples.length === 0) continue
    const pre = Array.isArray(spec.pre) ? spec.pre : []
    const abgelehnt = Array.isArray(spec.dismissed) ? spec.dismissed : []

    let reported = false
    for (const binding of spec.targets ?? []) {
      if (reported) break
      const target = getTarget(String(binding.target ?? ''))
      if (target === undefined || !target.multi) continue

      const chain = [...pre, ...(Array.isArray(binding.post) ? binding.post : [])]
      if (chain.some((s) => canonicalOp(String(s?.op ?? '')) === 'split')) continue

      for (const [sep, name] of separators) {
        const hits = examples.filter((e) => e.raw.includes(sep)).length
        if (hits < Math.max(1, Math.ceil(examples.length / 2))) continue
        // Wer den Vorschlag einmal abgelehnt hat, bekommt ihn nicht wieder.
        if (abgelehnt.some((d) => d.code === 'data.separator' && d.target === target.key && d.sep === sep)) continue
        out.push({
          severity: 'warning', code: 'data.separator', sourceField: col, targetField: target.key,
          message: `Die Werte enthalten ein ${name}. "${target.label}" nimmt mehrere Werte auf — mit `
            + '"Aufteilen" wird daraus je Wert ein eigener Eintrag statt einer langen Zeichenkette.',
          fix: { op: 'split', sep }
        })
        reported = true
        break
      }
    }
  }

  return out
}

/**
 * Rechnet eine einzelne Kette auf einen Wert — fuer die Sofortanzeige im Editor,
 * waehrend jemand an einem Konverter schraubt.
 */
export function previewChain(
  chain: Parameters<typeof runChain>[0],
  value: string,
  services: MappingServices = {}
): { value: string; list: string[]; errors: MappingMessage[]; notes: string[] } {
  const ctx = {
    ...(services.schema !== undefined ? { schema: services.schema } : {}),
    ...(services.resolveAuthority !== undefined ? { resolveAuthority: services.resolveAuthority } : {}),
    ...(services.lookupCountry !== undefined ? { lookupCountry: services.lookupCountry } : {}),
    ...(services.lookupLanguage !== undefined ? { lookupLanguage: services.lookupLanguage } : {})
  }
  const result = runChain(chain, value, ctx)
  const list = Array.isArray(result.value) ? result.value.map((v) => String(v)) : [String(result.value)]
  return {
    value: list.join('; '),
    list,
    // Der deutsche Satz reist mit, damit eine fehlende Uebersetzung nicht als
    // Code in der Oberflaeche landet.
    errors: result.errors.map((e) => ({ ...e, text: meldungstext(e) })),
    notes: result.notes
  }
}
