import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cellText, formatExcelDate, formatExcelNumber, isDateFormat } from '../../server/lib/converters/excelValue'
import { extractSheet, listSheets, unsupportedWorkbookMessage } from '../../server/lib/converters/spreadsheet'

/** 12. Maerz 1961, wie exceljs ein Excel-Datum ablegt: als Zeitpunkt in UTC. */
const DREHDATUM = new Date(Date.UTC(1961, 2, 12))

describe('Datumsformate', () => {
  it('erkennt Datumsformate', () => {
    expect(isDateFormat('dd.mm.yyyy')).toBe(true)
    expect(isDateFormat('[$-F400]h:mm:ss AM/PM')).toBe(true)
    expect(isDateFormat('#,##0.00')).toBe(false)
    expect(isDateFormat('General')).toBe(false)
    expect(isDateFormat(undefined)).toBe(false)
  })

  it('formatiert das Datum nach dem Zahlenformat', () => {
    expect(formatExcelDate(DREHDATUM, 'dd.mm.yyyy')).toBe('12.03.1961')
    expect(formatExcelDate(DREHDATUM, 'yyyy-mm-dd')).toBe('1961-03-12')
    expect(formatExcelDate(DREHDATUM, 'd. mmmm yyyy')).toBe('12. März 1961')
  })

  it('rechnet in UTC und verschiebt das Datum nicht um einen Tag', () => {
    // Der bekannte Fehler: getDate() liest die Ortszeit. Westlich von UTC
    // wuerde daraus der 11.03.1961. Geprueft wird deshalb gegen die
    // Ortszeitdarstellung derselben Zeitangabe.
    const localDay = DREHDATUM.getDate()
    const formatted = formatExcelDate(DREHDATUM, 'dd.mm.yyyy')
    expect(formatted).toBe('12.03.1961')
    if (localDay !== 12) {
      // Nur in einer Zeitzone ungleich UTC aussagekraeftig — dann zeigt sich,
      // dass die Formatierung eben NICHT der Ortszeit folgt.
      expect(formatted.startsWith(String(localDay).padStart(2, '0'))).toBe(false)
    }
  })

  it('unterscheidet Monat und Minute wie Excel', () => {
    const d = new Date(Date.UTC(2026, 0, 2, 15, 4, 5))
    expect(formatExcelDate(d, 'dd.mm.yyyy')).toBe('02.01.2026')
    expect(formatExcelDate(d, 'hh:mm:ss')).toBe('15:04:05')
    expect(formatExcelDate(d, 'dd.mm.yyyy hh:mm')).toBe('02.01.2026 15:04')
  })

  it('gibt Laufzeiten am Serientag 0 als Uhrzeit aus', () => {
    // Eine Filmlaufzeit von 6 Minuten liegt in Excel am 30.12.1899.
    const laufzeit = new Date(Date.UTC(1899, 11, 30, 0, 6, 0))
    expect(formatExcelDate(laufzeit, 'h:mm:ss')).toBe('0:06:00')
    expect(formatExcelDate(laufzeit, '[$-F400]h:mm:ss AM/PM')).toBe('12:06:00 AM')
    expect(formatExcelDate(laufzeit, '')).toBe('00:06:00')
  })

  it('zaehlt verstrichene Stunden ueber 24 hinaus', () => {
    const lang = new Date(Date.UTC(1899, 11, 31, 3, 30, 0)) // 27 Stunden 30 Minuten
    expect(formatExcelDate(lang, '[h]:mm')).toBe('27:30')
  })
})

describe('Zellwerte', () => {
  it('liefert Text statt [object Object] bei Formeln', () => {
    expect(cellText({ value: { formula: 'A1+B1', result: 42 } })).toBe('42')
    expect(cellText({ value: { formula: 'SUM(#REF!)', result: { error: '#REF!' } } })).toBe('#REF!')
    expect(cellText({ value: { formula: 'X', result: null } })).toBe('')
  })

  it('liefert den Fehlercode einer Fehlerzelle', () => {
    expect(cellText({ value: { error: '#DIV/0!' } })).toBe('#DIV/0!')
  })

  it('setzt formatierten Text zusammen', () => {
    expect(cellText({ value: { richText: [{ text: 'Der ' }, { text: 'Golem' }] } })).toBe('Der Golem')
  })

  it('schreibt Zahlen ohne Gruppierung und ohne Exponent', () => {
    expect(formatExcelNumber(3200201, undefined)).toBe('3200201')
    expect(formatExcelNumber(3200201, 'General')).toBe('3200201')
    expect(formatExcelNumber(26.958333333, '0.00')).toBe('26,96')
    expect(formatExcelNumber(0.5, '0%')).toBe('50 %')
  })

  it('formatiert eine Datumszelle ueber ihr Zahlenformat', () => {
    expect(cellText({ value: DREHDATUM, numFmt: 'dd.mm.yyyy' })).toBe('12.03.1961')
  })
})

describe('Arbeitsmappe', () => {
  let dir = ''
  let file = ''

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'avefi-xlsx-'))
    file = join(dir, 'Bestand.xlsx')

    const wb = new ExcelJS.Workbook()
    const cover = wb.addWorksheet('Deckblatt')
    cover.getCell('A1').value = 'Bestandsübersicht'

    const films = wb.addWorksheet('Filme')
    films.addRow(['Titel', 'Drehdatum', 'Laufzeit', 'Signatur'])
    const row = films.addRow(['Metropolis', DREHDATUM, new Date(Date.UTC(1899, 11, 30, 2, 33, 0)), 3200201])
    row.getCell(2).numFmt = 'dd.mm.yyyy'
    row.getCell(3).numFmt = 'h:mm:ss'
    films.addRow(['Nosferatu', new Date(Date.UTC(1922, 2, 4)), null, 3200202]).getCell(2).numFmt = 'dd.mm.yyyy'

    const legende = wb.addWorksheet('Legende')
    legende.getCell('A1').value = 'nur eine Spalte'

    await wb.xlsx.writeFile(file)
  })

  afterAll(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true })
  })

  it('waehlt nur Blaetter mit zwei Spalten und einer Datenzeile vor', async () => {
    const sheets = await listSheets(file)
    const byName = Object.fromEntries(sheets.map((s) => [s.name, s]))
    expect(byName.Deckblatt?.usable).toBe(false)
    expect(byName.Legende?.usable).toBe(false)
    expect(byName.Filme?.usable).toBe(true)
    expect(byName.Filme?.rows).toBe(2)
    expect(byName.Filme?.cols).toBe(4)
  })

  it('loest ein Blatt als CSV heraus und behaelt das Datum', async () => {
    const dest = join(dir, 'filme.csv')
    const info = await extractSheet(file, 'Filme', dest)
    expect(info.rows).toBe(2)

    const csv = await readFile(dest, 'utf8')
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('Titel,Drehdatum,Laufzeit,Signatur')
    // Kein Serienwert 22371, kein um einen Tag verschobenes Datum.
    expect(lines[1]).toBe('Metropolis,12.03.1961,2:33:00,3200201')
    expect(lines[2]).toBe('Nosferatu,04.03.1922,,3200202')
  })

  it('meldet ein nicht gewaehltes Blatt statt still eine leere Datei zu schreiben', async () => {
    await expect(extractSheet(file, 'Gibtesnicht', join(dir, 'x.csv'))).rejects.toThrow(/nicht enthalten/)
  })
})

describe('Nicht gelesene Arbeitsmappenformate', () => {
  it('nennt fuer .xls einen gangbaren Weg', () => {
    const msg = unsupportedWorkbookMessage('xls', 'Bestand.xls')
    expect(msg).toContain('.xlsx')
    expect(msg).toContain('Speichern unter')
  })

  it('nennt fuer .ods einen gangbaren Weg', () => {
    expect(unsupportedWorkbookMessage('ods')).toContain('LibreOffice')
  })
})
