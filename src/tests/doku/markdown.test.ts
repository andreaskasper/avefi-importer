/*
 * Die Markdown-Uebersetzung der Oberflaechenbeschreibungen.
 *
 * Geprueft wird, was die Beschreibungen tatsaechlich enthalten: Ueberschriften,
 * verschachtelte Nummernlisten mit fortlaufender Zaehlung, harte Zeilenumbrueche,
 * Code im Fliesstext und Verweise zwischen den Dateien.
 */
import { describe, expect, it } from 'vitest'
import { markdownNachHtml } from '../../server/lib/doku/markdown'

describe('markdownNachHtml', () => {
  it('nimmt die erste Ueberschrift der Stufe 1 als Titel und laesst sie im HTML weg', () => {
    const { titel, html } = markdownNachHtml('# Importliste\n\nText.\n')
    expect(titel).toBe('Importliste')
    expect(html).not.toContain('<h1')
    expect(html).toContain('<p>Text.</p>')
  })

  it('behaelt die Stufen der uebrigen Ueberschriften', () => {
    const { html } = markdownNachHtml('# A\n\n## Teil 1\n\n### Landmarken\n')
    expect(html).toContain('<h2 id="teil-1">Teil 1</h2>')
    expect(html).toContain('<h3 id="landmarken">Landmarken</h3>')
  })

  it('gibt jeder Ueberschrift eine Kennung, mit umschriebenen Umlauten', () => {
    // Umlaute umschreiben statt entfernen: Sonst bekaemen „Schemapruefung" und
    // „Schemaprufung" dieselbe Kennung, und ein Verweis traefe die falsche Stelle.
    const { html } = markdownNachHtml('# A\n\n## Verstoss gegen das Schema\n\n## Die Schemapruefung\n')
    expect(html).toContain('<h2 id="verstoss-gegen-das-schema">')
    expect(html).toContain('<h2 id="die-schemapruefung">')
  })

  it('zaehlt gleichlautende Ueberschriften durch', () => {
    // Zwei gleiche id-Werte auf einer Seite sind ein Barrierefreiheitsfehler,
    // und ein Verweis koennte nicht sagen, welche Stelle er meint.
    const { html } = markdownNachHtml('# A\n\n## Hinweis\n\n## Hinweis\n')
    expect(html).toContain('<h2 id="hinweis">')
    expect(html).toContain('<h2 id="hinweis-2">')
  })

  it('setzt die Nummern der Liste ausdruecklich und verschachtelt nach Einzug', () => {
    const { html } = markdownNachHtml('1. Kopfbereich\n  2. Navigation\n3. Hauptbereich\n')
    expect(html).toContain('<li value="1">')
    expect(html).toContain('<li value="2">')
    expect(html).toContain('<li value="3">')
    // Der zweite Punkt liegt in einer eigenen, eingeschobenen Liste.
    expect(html.match(/<ol>/g)?.length).toBe(2)
    expect(html.indexOf('<li value="2">')).toBeGreaterThan(html.indexOf('<li value="1">'))
    expect(html.indexOf('</ol>')).toBeLessThan(html.indexOf('<li value="3">'))
  })

  it('unterscheidet Aufzaehlung und Nummernliste', () => {
    const { html } = markdownNachHtml('- Eins\n- Zwei\n')
    expect(html).toContain('<ul>')
    expect(html).not.toContain('value=')
  })

  it('macht aus zwei Leerzeichen am Zeilenende einen Umbruch', () => {
    const { html } = markdownNachHtml('Adresse: `/`  \nSprache: `de`\n')
    expect(html).toContain('<br>')
    expect(html).toContain('<code>/</code>')
  })

  it('erkennt Fettschrift und Tabellen', () => {
    const { html } = markdownNachHtml('**Stand:** heute\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n')
    expect(html).toContain('<strong>Stand:</strong>')
    expect(html).toContain('<th scope="col">A</th>')
    expect(html).toContain('<td>2</td>')
  })

  it('maskiert Markup aus der Quelle', () => {
    const { html } = markdownNachHtml('Ein <script>alert(1)</script> im Text.\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('schreibt Linkziele um und laesst unerlaubte Ziele als Text stehen', () => {
    const { html } = markdownNachHtml('[Anmeldung](01-anmeldung.md) und [Falle](javascript:alert(1))', {
      link: (ziel) => (ziel === '01-anmeldung.md' ? '/dokumentation/oberflaeche/01-anmeldung' : ziel)
    })
    expect(html).toContain('<a href="/dokumentation/oberflaeche/01-anmeldung">Anmeldung</a>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('Falle')
  })

  it('haelt Auszeichnungen aus Code im Fliesstext heraus', () => {
    const { html } = markdownNachHtml('Datei `neu_UPB_Test.csv` und `a**b**c`.\n')
    expect(html).toContain('<code>neu_UPB_Test.csv</code>')
    expect(html).toContain('<code>a**b**c</code>')
  })
})
