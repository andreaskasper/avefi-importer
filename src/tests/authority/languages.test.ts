/*
 * Sprachtabelle nach ISO 639-2.
 *
 * Der Mappingkern hat nur eine kleine Rueckfalltabelle und sagt selbst, dass die
 * vollstaendige hier eingehaengt werden soll. Also muss sie alles koennen, was
 * die Rueckfalltabelle kann — und deutlich mehr.
 */

import { describe, expect, it } from 'vitest'
import { builtinLanguageCode } from '../../server/lib/mapping/transform.js'
import {
  allLanguages, languageEntry, languageLabel, languageTableSize, lookupLanguage
} from '../../server/lib/authority/languages.js'

describe('Sprachen nachschlagen', () => {
  it('liefert den bibliografischen Code — "ger", nicht "deu"', () => {
    for (const schreibweise of ['Deutsch', 'deutsch', 'de', 'deu', 'ger', 'German', ' DEUTSCH ']) {
      expect(lookupLanguage(schreibweise), schreibweise).toBe('ger')
    }
  })

  it('kennt die gaengigen Filmsprachen', () => {
    expect(lookupLanguage('Englisch')).toBe('eng')
    expect(lookupLanguage('Französisch')).toBe('fre')
    expect(lookupLanguage('Italienisch')).toBe('ita')
    expect(lookupLanguage('Russisch')).toBe('rus')
    expect(lookupLanguage('Niederländisch')).toBe('dut')
    expect(lookupLanguage('Tschechisch')).toBe('cze')
  })

  it('findet Bezeichnungen auch in der Umschrift ohne Umlaute', () => {
    expect(lookupLanguage('franzoesisch')).toBe('fre')
    expect(lookupLanguage('tuerkisch')).toBe('tur')
    expect(lookupLanguage('daenisch')).toBe('dan')
    expect(lookupLanguage('niederlaendisch')).toBe('dut')
  })

  it('macht aus dem Stummfilm den amtlichen Code zxx', () => {
    for (const s of ['stumm', 'Stummfilm', 'ohne Sprache', 'keine', 'silent', 'zxx']) {
      expect(lookupLanguage(s), s).toBe('zxx')
    }
  })

  it('kann alles, was die Rueckfalltabelle des Mappingkerns kann', () => {
    const proben = [
      'deutsch', 'german', 'de', 'deu', 'ger', 'englisch', 'english', 'en', 'eng',
      'französisch', 'french', 'fr', 'fra', 'fre', 'italienisch', 'italian', 'it', 'ita',
      'spanisch', 'spanish', 'es', 'spa', 'russisch', 'ru', 'rus', 'polnisch', 'pl', 'pol',
      'niederländisch', 'dutch', 'nl', 'nld', 'dut', 'tschechisch', 'czech', 'cs', 'ces', 'cze',
      'dänisch', 'danish', 'da', 'dan', 'schwedisch', 'swedish', 'sv', 'swe',
      'türkisch', 'turkish', 'tr', 'tur', 'ungarisch', 'hungarian', 'hu', 'hun',
      'latein', 'latin', 'la', 'lat', 'japanisch', 'japanese', 'ja', 'jpn',
      'stumm', 'ohne sprache', 'keine', 'zxx'
    ]
    for (const p of proben) {
      const klein = builtinLanguageCode(p)
      expect(lookupLanguage(p), `${p} (Rueckfall: ${String(klein)})`).toBe(klein)
    }
  })

  it('kennt weit mehr als die Rueckfalltabelle', () => {
    expect(builtinLanguageCode('Suaheli')).toBeNull()
    expect(lookupLanguage('Swahili')).toBe('swa')
    expect(lookupLanguage('Kisuaheli')).toBeNull()   // nur amtliche Bezeichnungen
    expect(lookupLanguage('Georgisch')).toBe('geo')
    expect(lookupLanguage('Bretonisch')).toBe('bre')
    expect(lookupLanguage('Sorbisch')).not.toBeNull()
  })

  it('liefert null bei Unbekanntem', () => {
    // Klingonisch steht als "tlh" tatsaechlich in der Codeliste — die Tabelle
    // ist vollstaendiger, als man denkt.
    expect(lookupLanguage('tlh')).toBe('tlh')
    expect(lookupLanguage('Fantasiesprache')).toBeNull()
    expect(lookupLanguage('Sprache des Hauses')).toBeNull()
    expect(lookupLanguage('')).toBeNull()
  })

  it('laesst einen Code nicht von einer Bezeichnung verdraengen', () => {
    // "no" ist Norwegisch, auch wenn es wie ein Nein aussieht.
    expect(lookupLanguage('no')).toBe('nor')
  })

  it('die Tabelle ist vollstaendig', () => {
    expect(languageTableSize()).toBeGreaterThan(480)
  })
})

describe('Anzeige', () => {
  it('nennt die deutsche Bezeichnung zu einem Code', () => {
    expect(languageLabel('ger')).toBe('Deutsch')
    expect(languageLabel('fre')).toBe('Französisch')
  })

  it('faellt auf den Code zurueck, wenn er unbekannt ist', () => {
    expect(languageLabel('xyz')).toBe('xyz')
  })

  it('liefert den ganzen Eintrag', () => {
    const e = languageEntry('ger')
    expect(e?.term).toBe('deu')
    expect(e?.alpha2).toBe('de')
    expect(e?.en).toContain('German')
  })

  it('jeder Eintrag hat mindestens eine Bezeichnung', () => {
    expect(allLanguages().filter((e) => e.en.length === 0)).toEqual([])
  })
})
