import { describe, expect, it } from 'vitest'
import { csvLine, sniffDelimiterFromText, stripBom } from '../../server/lib/converters/csv'

describe('Trennzeichenerkennung', () => {
  it('erkennt Komma', () => {
    expect(sniffDelimiterFromText('Titel,Jahr,Land\nMetropolis,1927,DE\n')).toBe(',')
  })

  it('erkennt Semikolon', () => {
    expect(sniffDelimiterFromText('Titel;Jahr;Land\nMetropolis;1927;DE\n')).toBe(';')
  })

  it('erkennt Tabulator', () => {
    expect(sniffDelimiterFromText('Titel\tJahr\tLand\nMetropolis\t1927\tDE\n')).toBe('\t')
  })

  it('erkennt den senkrechten Strich', () => {
    expect(sniffDelimiterFromText('Titel|Jahr|Land\nMetropolis|1927|DE\n')).toBe('|')
  })

  it('zaehlt Kommas in Feldinhalten nicht mit', () => {
    // Der PHP-Stand zaehlte die Zeichen der Kopfzeile roh und entschied sich
    // hier fuer das Komma — die Datei waere einspaltig gelesen worden.
    const text = '"Titel, Untertitel";"Jahr";"Land"\n"Metropolis, ein Film";1927;DE\n'
    expect(sniffDelimiterFromText(text)).toBe(';')
  })

  it('laesst sich von einem Semikolon in einem Feld nicht taeuschen', () => {
    const text = 'Titel,Bemerkung,Jahr\nMetropolis,"Stumm; restauriert",1927\nNosferatu,"Nitro; Kopie",1922\n'
    expect(sniffDelimiterFromText(text)).toBe(',')
  })

  it('faellt bei einer einspaltigen Datei auf die Vorgabe zurueck', () => {
    expect(sniffDelimiterFromText('Titel\nMetropolis\nNosferatu\n', ';')).toBe(';')
  })

  it('kommt mit einer Byte-Order-Mark zurecht', () => {
    expect(sniffDelimiterFromText(stripBom('﻿Titel;Jahr\nMetropolis;1927\n'))).toBe(';')
  })

  it('waehlt das Trennzeichen mit der gleichmaessigsten Spaltenzahl', () => {
    // Kommas kommen oefter vor, ergeben aber unregelmaessige Zeilen.
    const text = 'a;b;c\n1,2,3,4;x;y\n5;6;7\n8;9;10\n'
    expect(sniffDelimiterFromText(text)).toBe(';')
  })
})

describe('CSV schreiben', () => {
  it('verdoppelt Anfuehrungszeichen statt sie zu maskieren', () => {
    expect(csvLine(['Er sagte "Hallo"', 'x'])).toBe('"Er sagte ""Hallo""",x\n')
  })

  it('behaelt einen abschliessenden Rueckstrich', () => {
    // Der PHP-Stand schrieb mit \\ als Maskierzeichen und las ohne — ein Wert,
    // der auf einen Rueckstrich endet, zerstoerte dort die Zeilenstruktur.
    const line = csvLine(['Pfad\\', 'weiter'])
    expect(line).toBe('Pfad\\,weiter\n')
  })

  it('setzt Felder mit Zeilenumbruch in Anfuehrungszeichen', () => {
    expect(csvLine(['a\nb', 'c'])).toBe('"a\nb",c\n')
  })
})
