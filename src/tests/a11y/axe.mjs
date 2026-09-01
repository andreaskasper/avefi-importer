/**
 * Barrierefreiheit maschinell pruefen.
 *
 * Faehrt die Kernseiten mit einem echten Browser an, meldet sich an, oeffnet
 * zusaetzlich die Zustaende, die eine Pruefung im Ruhezustand nicht sieht
 * (Zeilenmenue, Rueckfrage, Nutzermenue, aufgeklappte Zuordnungszeile,
 * Konverterauswahl, Zielliste, Reiter des Schema-Editors) und laesst auf
 * jedem Stand axe-core laufen. Dazu kommen die Oberflaechenbeschreibungen
 * unter /dokumentation/oberflaeche, deren Kapitel aus der Uebersicht gelesen
 * werden.
 *
 * Der Aufruf steht in docs/barrierefreiheit.md. Beendet sich mit 1, sobald ein
 * Befund der Schwere „serious" oder „critical" auftritt.
 *
 * Die Seitenkennungen werden aus der laufenden Anwendung gelesen. Damit taugt
 * das Skript auf jedem Bestand und muss nicht gepflegt werden, wenn ein
 * Testimport wegfaellt.
 *
 * Stirbt der Browser unterwegs weg — auf den grossen Zuordnungsseiten kommt
 * das bei langen Durchgaengen vor —, wird er neu gestartet und der Abschnitt
 * wiederholt. Sonst blieben die Staende danach ungeprueft, ohne dass es
 * jemandem auffiele.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

const BASIS = process.env.A11Y_BASE ?? 'http://localhost:3000'
const NUTZER = process.env.A11Y_USER ?? 'admin@av-efi.net'
const PASSWORT = process.env.A11Y_PASS ?? 'changeme'
const SCHEMATA = (process.env.A11Y_THEMES ?? 'light,dark').split(',').map((s) => s.trim()).filter(Boolean)
/** Ab dieser Schwere gilt die Pruefung als nicht bestanden. */
const HART = new Set(['critical', 'serious'])
const REGELN = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const befunde = []
let geprueft = 0

function melden(stand, ergebnis) {
  geprueft++
  const zahl = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const v of ergebnis.violations) zahl[v.impact ?? 'minor'] += v.nodes.length
  const hart = ergebnis.violations.filter((v) => HART.has(v.impact ?? ''))
  const marke = hart.length > 0 ? 'FEHLER' : 'ok    '
  console.log(`${marke} ${stand}  critical=${zahl.critical} serious=${zahl.serious} moderate=${zahl.moderate} minor=${zahl.minor}`)
  for (const v of ergebnis.violations) {
    const wcag = v.tags.filter((t) => t.startsWith('wcag')).join(',')
    console.log(`         ${v.impact} · ${v.id} · ${v.nodes.length}× · ${wcag || '-'}`)
    console.log(`           ${v.help}`)
    for (const n of v.nodes.slice(0, 3)) console.log(`           → ${n.target.join(' ')}`)
    if (HART.has(v.impact ?? '')) befunde.push(`${stand}: ${v.impact}/${v.id} (${v.nodes.length}×)`)
  }
}

/**
 * Kontrast aus den gerenderten Bildpunkten bestimmen.
 *
 * axe rechnet den Kontrast aus den berechneten Farben. Liegt hinter dem Text
 * ein Hintergrundbild, gibt es auf und meldet „incomplete" — kein Verstoss,
 * keine Entwarnung, sondern „nicht beurteilt". daisyUI legt auf jeden Knopf
 * ein Hintergrundbild, also fielen am 01.09.2026 saemtliche Knoepfe in diese
 * Luecke: 171 allein auf der Startseite. Der Lauf meldete „kein Befund" und
 * meinte „keiner unter denen, die ich beurteilen konnte".
 *
 * Hier wird deshalb nachgemessen, woran nichts mehr zu deuteln ist: Das
 * Element wird abfotografiert, die haeufigste Farbe gilt als Grund, die
 * haeufigste deutlich abweichende als Schrift.
 */
async function kontrastMessen(seite, element) {
  // Die Schriftfarbe kommt aus dem Stylesheet, nicht aus dem Bild. axe scheitert
  // am HINTERGRUND, nie am Vordergrund — und auf einem Farbverlauf sind die zwei
  // haeufigsten Bildfarben beide Hintergrund. Wer die dunklere fuer Schrift
  // haelt, meldet den Abstand zwischen zwei Verlaufsstufen als Kontrastfehler.
  const schrift = await element.evaluate((n) => getComputedStyle(n).color)
  const bild = await element.screenshot({ timeout: 5000 })
  return seite.evaluate(async ([datenUrl, schriftfarbe]) => {
    const zahlen = schriftfarbe.match(/[\d.]+/g) ?? []
    const schrift = ((+zahlen[0] || 0) << 16) | ((+zahlen[1] || 0) << 8) | (+zahlen[2] || 0)

    const bild = new Image()
    bild.src = datenUrl
    await bild.decode()
    const flaeche = document.createElement('canvas')
    flaeche.width = bild.width
    flaeche.height = bild.height
    const stift = flaeche.getContext('2d')
    stift.drawImage(bild, 0, 0)
    // Den Rand wegschneiden. Ein Knopf hat abgerundete Ecken; dort steht der
    // Seitenhintergrund, und dazwischen liegt die Kantenglaettung - eine
    // Mischung aus Knopffarbe und Seitenfarbe. Genau diese Mischfarben haben
    // wenig Abstand zur Schrift und wurden sonst als "unguenstigster
    // Hintergrund" gewaehlt: Am 01.09.2026 meldete die Pruefung so 1,93:1 fuer
    // einen Knopf, der in Wahrheit 5,48:1 hat.
    const rand = Math.min(4, Math.floor(Math.min(flaeche.width, flaeche.height) / 4))
    const punkte = stift.getImageData(
      rand, rand,
      Math.max(1, flaeche.width - 2 * rand),
      Math.max(1, flaeche.height - 2 * rand)
    ).data

    const kanal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const helligkeit = (f) => 0.2126 * kanal(f >> 16 & 255) + 0.7152 * kanal(f >> 8 & 255) + 0.0722 * kanal(f & 255)
    const verhaeltnis = (a, b) => {
      const hoch = Math.max(helligkeit(a), helligkeit(b))
      const tief = Math.min(helligkeit(a), helligkeit(b))
      return (hoch + 0.05) / (tief + 0.05)
    }
    const abstand = (a, b) => Math.abs((a >> 16 & 255) - (b >> 16 & 255)) +
      Math.abs((a >> 8 & 255) - (b >> 8 & 255)) + Math.abs((a & 255) - (b & 255))

    const haeufigkeit = new Map()
    for (let i = 0; i < punkte.length; i += 4) {
      const farbe = (punkte[i] << 16) | (punkte[i + 1] << 8) | punkte[i + 2]
      haeufigkeit.set(farbe, (haeufigkeit.get(farbe) ?? 0) + 1)
    }
    const gesamt = punkte.length / 4

    // Hintergrund ist alles, was nicht die Schrift und nicht ihre Kantenglaettung
    // ist. Gewertet wird der unguenstigste Punkt darunter: Steht Text auf einem
    // Verlauf, entscheidet die Stelle, an der er am schlechtesten steht.
    let grund = null
    let schlechtestes = Infinity
    let hatSchrift = false
    for (const [farbe, anzahl] of haeufigkeit) {
      if (abstand(farbe, schrift) < 90) { if (anzahl / gesamt > 0.002) hatSchrift = true; continue }
      if (anzahl / gesamt < 0.02) continue
      const k = verhaeltnis(schrift, farbe)
      if (k < schlechtestes) { schlechtestes = k; grund = farbe }
    }

    const hex = (f) => '#' + f.toString(16).padStart(6, '0')
    // Ohne erkennbare Schriftpunkte im Bild ist nichts zu messen — etwa wenn das
    // Element nur ein Bild oder eine leere Flaeche umschliesst.
    if (!hatSchrift || grund === null) return { grund: '-', schrift: hex(schrift), verhaeltnis: 0 }
    return { grund: hex(grund), schrift: hex(schrift), verhaeltnis: Math.round(schlechtestes * 100) / 100 }
  }, ['data:image/png;base64,' + bild.toString('base64'), schrift])
}

/**
 * Die Kontraste nachmessen, die axe offengelassen hat.
 *
 * Gleichartige Elemente werden einmal gemessen: Eine Tabelle mit neunzig
 * Zeilen hat neunzig gleiche Knoepfe, und neunzigmal dieselbe Zahl macht das
 * Protokoll unlesbar, ohne etwas hinzuzufuegen.
 */
async function offeneKontraste(seite, ergebnis, stand) {
  // Nur die Faelle, in denen axe den HINTERGRUND nicht bestimmen konnte. axe
  // laesst Kontraste auch aus einem zweiten Grund offen: „content contains only
  // non-text characters". Das sind Zierzeichen — Pfeile, Auslassungspunkte,
  // Symbole —, und fuer die gilt nicht die Schwelle 4,5:1 fuer Text, sondern
  // 3:1 fuer Nicht-Text (WCAG 1.4.11). Sie hier mitzumessen hat beim ersten
  // Lauf prompt zwei Befunde erzeugt, die keine waren.
  const knoten = ergebnis.incomplete
    .filter((regel) => regel.id === 'color-contrast')
    .flatMap((regel) => regel.nodes)
    .filter((n) => /background/i.test(n.any?.[0]?.message ?? ''))
    .map((n) => n.target.join(' '))
  const gemessen = []
  const nichtMessbar = []
  const gesehen = new Set()
  for (const auswahl of knoten) {
    if (gemessen.length >= 60) break
    let element
    try {
      element = await seite.locator(auswahl).first()
      if (!(await element.isVisible())) continue
    } catch { continue }
    let merkmale
    try {
      merkmale = await element.evaluate((n) => ({
        kennung: `${n.tagName}.${n.className}|${(n.innerText ?? '').trim().slice(0, 20)}`,
        verborgen: n.closest('[aria-hidden="true"]') !== null,
        text: (n.innerText ?? '').trim()
      }))
    } catch { continue }
    // Was vor Vorlesewerkzeugen verborgen ist, ist Zierat; und wo kein Text
    // steht, gibt es keinen Textkontrast zu messen.
    if (merkmale.verborgen || merkmale.text === '') continue
    if (gesehen.has(merkmale.kennung)) continue
    gesehen.add(merkmale.kennung)
    try {
      const mass = await kontrastMessen(seite, element)
      // Genau 1:1 heisst: In der Aufnahme kam nur eine Farbe vor. Dann ist
      // nichts gemessen worden, und „1:1" als Befund zu melden waere eine
      // Behauptung ueber ein Bild, auf dem nichts zu sehen war.
      if (mass.verhaeltnis <= 0) { nichtMessbar.push(auswahl); continue }
      gemessen.push({ auswahl, kennung: merkmale.kennung, ...mass })
    } catch { /* Element ist weg oder nicht abzulichten */ }
  }
  const zuWenig = gemessen.filter((m) => m.verhaeltnis < 4.5)
  if (knoten.length > 0) {
    const rest = nichtMessbar.length > 0 ? `, ${nichtMessbar.length} nicht messbar` : ''
    console.log(`         offener Kontrast: ${knoten.length} Stellen, ${gemessen.length} Arten nachgemessen, ${zuWenig.length} zu schwach${rest}`)
  }
  for (const m of zuWenig) {
    console.log(`           NACHGEMESSEN ${m.verhaeltnis}:1  ${m.schrift} auf ${m.grund}  ${m.auswahl}`)
    befunde.push(`${stand}: Kontrast ${m.verhaeltnis}:1 (nachgemessen) bei ${m.auswahl}`)
  }
  return { offen: knoten.length, zuWenig: zuWenig.length }
}

async function pruefe(seite, stand) {
  await seite.evaluate(AXE)
  // Ohne die offenen Punkte waere „kein Befund" eine Aussage ueber die
  // Reichweite des Werkzeugs, nicht ueber die Seite.
  const ergebnis = await seite.evaluate(
    async (regeln) => window.axe.run(document, { runOnly: { type: 'tag', values: regeln } }),
    REGELN
  )
  melden(stand, ergebnis)
  const andereOffen = ergebnis.incomplete.filter((r) => r.id !== 'color-contrast')
  if (andereOffen.length > 0) {
    const summe = andereOffen.reduce((n, r) => n + r.nodes.length, 0)
    console.log(`         nicht beurteilt: ${summe}x in ${andereOffen.map((r) => r.id).join(', ')}`)
  }
  await offeneKontraste(seite, ergebnis, stand)
}

async function anmelden(seite) {
  await seite.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await seite.fill('#email', NUTZER)
  await seite.fill('#password', PASSWORT)
  await seite.click('button[type=submit]')
  await seite.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 })
  await seite.waitForTimeout(1500)
}

/** Erste Adresse, die zu einem Muster passt — so bleiben die Kennungen aktuell. */
async function ersteAdresse(seite, muster) {
  return seite.evaluate((m) => {
    const re = new RegExp(m)
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') ?? ''
      if (re.test(href)) return href
    }
    return null
  }, muster)
}

let browser = null
let kontext = null
let seite = null

async function browserStarten() {
  browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--disable-dev-shm-usage'] })
  kontext = await browser.newContext({ viewport: { width: 1500, height: 1100 }, locale: 'de-DE', ignoreHTTPSErrors: true })
  seite = await kontext.newPage()
  // Farbuebergaenge aus: Nach einem Themenwechsel wandert die Farbe eines
  // Knopfes ueber 300 ms von alt nach neu. Wer in dieser Zeit misst, misst eine
  // Zwischenstufe, die es in keinem Thema gibt - und meldet sie als Befund.
  await kontext.addInitScript(() => {
    const stil = document.createElement('style')
    stil.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'
    if (document.head) document.head.appendChild(stil)
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(stil))
  })
}

/**
 * Nach einem Absturz von vorn: neuer Browser, neue Anmeldung.
 *
 * Auf den grossen Zuordnungsseiten verabschiedet sich der Browser im Laufe
 * eines langen Durchgangs gelegentlich. Ohne diesen Rueckfall endet die
 * Pruefung dort mitten im Lauf, und die restlichen Staende bleiben ungeprueft
 * — das saehe aus wie „nichts gefunden", waere aber „nicht nachgesehen".
 */
async function browserSichern() {
  if (browser !== null && browser.isConnected() && seite !== null && !seite.isClosed()) return
  if (browser !== null) {
    console.log('  Browser war weg — neu gestartet und neu angemeldet.')
    try { await browser.close() } catch { /* schon tot */ }
  }
  await browserStarten()
  await anmelden(seite)
}

/**
 * Ein Abschnitt der Pruefung, der einen Browserabsturz uebersteht.
 *
 * Faellt der Browser mitten im Abschnitt aus, beginnt der Abschnitt von vorn.
 * Bereits gemeldete Staende stehen dann zweimal im Protokoll; das ist der
 * Preis dafuer, dass keiner ungeprueft bleibt.
 */
async function abschnitt(name, arbeit) {
  for (let versuch = 1; versuch <= 3; versuch++) {
    await browserSichern()
    try {
      await arbeit()
      return
    } catch (fehler) {
      const lebt = browser.isConnected() && !seite.isClosed()
      if (lebt) throw fehler
      console.log(`  ${name}: Browser weg — Anlauf ${versuch} von 3.`)
    }
  }
  throw new Error(`${name}: auch nach drei Anlaeufen kein Durchkommen.`)
}

await browserStarten()

try {
  /* -------------------------------------------------- Kennungen einsammeln */
  await seite.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await seite.waitForTimeout(800)
  for (const schema of SCHEMATA) {
    await seite.evaluate((s) => document.documentElement.setAttribute('data-theme', s), schema)
    await seite.waitForTimeout(400)
    await pruefe(seite, `/login [${schema}]`)
  }

  await anmelden(seite)
  await seite.waitForTimeout(2500)

  const zurZuordnung = await ersteAdresse(seite, '^/imports/[^/]+/mapping$')
  const zuDatensaetzen = await ersteAdresse(seite, '^/imports/[^/]+/records$')
  const zumImport = await ersteAdresse(seite, '^/imports/[^/]+$')
  const importId = (zuDatensaetzen ?? zumImport ?? '').split('/')[2] ?? ''

  await seite.goto(`${BASIS}/mappings`, { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const zumProfil = await ersteAdresse(seite, '^/mappings/\\d+$')

  await seite.goto(`${BASIS}/reviews`, { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const zurPruefung = await ersteAdresse(seite, '^/reviews/\\d+$')

  await seite.goto(`${BASIS}/users`, { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const zumNutzer = await ersteAdresse(seite, '^/users/\\d+$')

  let zumDatensatz = null
  if (zuDatensaetzen !== null) {
    await seite.goto(BASIS + zuDatensaetzen, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(1800)
    zumDatensatz = await ersteAdresse(seite, '^/imports/[^/]+/records/\\d+$')
  }

  const seiten = [
    '/',
    importId !== '' ? `/imports/${importId}` : null,
    importId !== '' ? `/imports/${importId}/report` : null,
    zurZuordnung,
    zuDatensaetzen,
    zumDatensatz,
    '/mappings',
    zumProfil,
    zumProfil === null ? null : `${zumProfil}/edit`,
    // Die Normdatenseite ist der zweite Ort, an dem Zuordnungen entstehen —
    // sie gehoert genauso geprueft wie der Editor.
    zumProfil === null ? null : `${zumProfil}/normdaten`,
    '/mappings/new',
    '/reviews',
    zurPruefung,
    '/users',
    zumNutzer,
    '/profile'
  ].filter((x) => x !== null)

  /* ------------------------------------------------------ Seiten im Ruhezustand */
  for (const pfad of seiten) {
    await abschnitt(pfad, async () => {
      await seite.goto(BASIS + pfad, { waitUntil: 'networkidle' })
      if (pfad === zurZuordnung) await seite.waitForSelector('table.maptable', { timeout: 30000 })
      await seite.waitForTimeout(2500)
      for (const schema of SCHEMATA) {
        await seite.evaluate((s) => document.documentElement.setAttribute('data-theme', s), schema)
        await seite.waitForTimeout(400)
        await pruefe(seite, `${pfad} [${schema}]`)
      }
    })
  }

  /* ------------------------------------------ Oberflaechenbeschreibungen */
  // Die Kapitel werden aus der Uebersicht gelesen, nicht hier aufgezaehlt: so
  // bleibt die Pruefung richtig, wenn eine Beschreibung dazukommt oder wegfaellt.
  let kapitel = []
  await abschnitt('/dokumentation/oberflaeche', async () => {
    await seite.goto(`${BASIS}/dokumentation/oberflaeche`, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(1500)
    kapitel = await seite.evaluate(() =>
      Array.from(
        document.querySelectorAll('.doku-body a[href^="/dokumentation/oberflaeche/"]'),
        (a) => a.getAttribute('href') ?? ''
      ).filter((h) => h !== ''))
    for (const schema of SCHEMATA) {
      await seite.evaluate((s) => document.documentElement.setAttribute('data-theme', s), schema)
      await seite.waitForTimeout(400)
      await pruefe(seite, `/dokumentation/oberflaeche [${schema}]`)
    }
  })

  for (const pfad of kapitel) {
    await abschnitt(pfad, async () => {
      await seite.goto(BASIS + pfad, { waitUntil: 'networkidle' })
      await seite.waitForTimeout(1200)
      for (const schema of SCHEMATA) {
        await seite.evaluate((s) => document.documentElement.setAttribute('data-theme', s), schema)
        await seite.waitForTimeout(400)
        await pruefe(seite, `${pfad} [${schema}]`)
      }
    })
  }

  /* ------------------------------------------------------ Geoeffnete Zustaende */
  await abschnitt('Menues der Importliste', async () => {
    await seite.goto(`${BASIS}/`, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(2000)

    const nutzermenue = seite.locator('.usermenu button').first()
    if (await nutzermenue.count()) {
      await nutzermenue.click()
      await seite.waitForTimeout(400)
      await pruefe(seite, '/ · Nutzermenue offen')
      await seite.keyboard.press('Escape')
    }

    const zeilenmenue = seite.locator('table tbody tr button[aria-haspopup=menu]').first()
    if (await zeilenmenue.count()) {
      await zeilenmenue.click()
      await seite.waitForTimeout(500)
      await pruefe(seite, '/ · Zeilenmenue offen')
      const loeschen = seite.locator('[role=menu] button.menu-item.danger').first()
      if (await loeschen.count()) {
        await loeschen.click()
        await seite.waitForTimeout(600)
        await pruefe(seite, '/ · Rueckfrage offen')
        await seite.keyboard.press('Escape')
        await seite.waitForTimeout(300)
      }
    }
  })

  if (zurZuordnung !== null) await abschnitt(zurZuordnung + ' (geoeffnet)', async () => {
    await seite.goto(BASIS + zurZuordnung, { waitUntil: 'networkidle' })
    await seite.waitForSelector('table.maptable', { timeout: 30000 })
    await seite.waitForTimeout(3500)
    const zahnrad = seite.locator('table.maptable tbody .rowbtns button').first()
    await zahnrad.click()
    await seite.waitForTimeout(1200)
    await pruefe(seite, `${zurZuordnung} · Zeile aufgeklappt`)

    // Ohne Zweig gibt es keine Zielauswahl. Ein Vorschlag legt einen an; das
    // bleibt folgenlos, solange nicht gespeichert wird — und das tut die
    // Pruefung nirgends.
    if ((await seite.locator('.chainrow input[role=combobox]').count()) === 0) {
      const vorschlag = seite.locator('table.maptable tbody .tsugg .chip, table.maptable tbody .tsugg .btn').first()
      if (await vorschlag.count()) {
        await vorschlag.click()
        await seite.waitForTimeout(1800)
      }
    }
    const kombi = seite.locator('.chainrow input[role=combobox]').first()
    if (await kombi.count()) {
      await kombi.focus()
      await seite.waitForTimeout(900)
      await pruefe(seite, `${zurZuordnung} · Zielliste offen`)
      await seite.keyboard.press('Escape')
    }

    const jsonKasten = seite.locator('aside details.jsonbox summary').first()
    if (await jsonKasten.count()) {
      await jsonKasten.click()
      await seite.waitForTimeout(700)
      await pruefe(seite, `${zurZuordnung} · JSON-Vorschau offen`)
    }

    const schrittwahl = seite.locator('.chainrow .chain-add button').first()
    if (await schrittwahl.count()) {
      await schrittwahl.click()
      await seite.waitForTimeout(600)
      await pruefe(seite, `${zurZuordnung} · Konverterauswahl offen`)
      await seite.keyboard.press('Escape')
    }
  })

  if (zumDatensatz !== null) await abschnitt(zumDatensatz + ' (geoeffnet)', async () => {
    await seite.goto(BASIS + zumDatensatz, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(3000)
    const jsonKnopf = seite.locator('button[aria-controls="record-json"]').first()
    if (await jsonKnopf.count()) {
      await jsonKnopf.click()
      await seite.waitForTimeout(600)
    }
    // Seit dem 31.08. gibt es zwei Reiter: Werk und Aufbau. Die Exemplare
    // stehen im Aufbau unter ihrer Fassung, nicht mehr in einem eigenen Reiter.
    for (const reiter of ['structure']) {
      const knopf = seite.locator(`#tab-${reiter}`)
      if (await knopf.count()) {
        await knopf.click()
        await seite.waitForTimeout(900)
        await pruefe(seite, `${zumDatensatz} · Reiter ${reiter}`)
      }
    }
  })
} finally {
  if (browser !== null) await browser.close()
}

console.log(`\n${geprueft} Staende geprueft.`)
if (befunde.length > 0) {
  console.log(`NICHT BESTANDEN — ${befunde.length} Befund(e) ab "serious":`)
  for (const b of befunde) console.log('  ' + b)
  process.exit(1)
}
console.log('BESTANDEN — kein Befund der Schwere "serious" oder "critical".')
