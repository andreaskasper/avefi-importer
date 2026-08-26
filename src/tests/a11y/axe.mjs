/**
 * Barrierefreiheit maschinell pruefen.
 *
 * Faehrt die Kernseiten mit einem echten Browser an, meldet sich an, oeffnet
 * zusaetzlich die Zustaende, die eine Pruefung im Ruhezustand nicht sieht
 * (Zeilenmenue, Rueckfrage, Nutzermenue, aufgeklappte Zuordnungszeile,
 * Konverterauswahl, Zielliste, Reiter des Schema-Editors) und laesst auf
 * jedem Stand axe-core laufen.
 *
 * Der Aufruf steht in docs/barrierefreiheit.md. Beendet sich mit 1, sobald ein
 * Befund der Schwere „serious" oder „critical" auftritt.
 *
 * Die Seitenkennungen werden aus der laufenden Anwendung gelesen. Damit taugt
 * das Skript auf jedem Bestand und muss nicht gepflegt werden, wenn ein
 * Testimport wegfaellt.
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

async function pruefe(seite, stand) {
  await seite.evaluate(AXE)
  const ergebnis = await seite.evaluate(
    async (regeln) => window.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: regeln } }),
    REGELN
  )
  melden(stand, ergebnis)
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

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] })
const kontext = await browser.newContext({ viewport: { width: 1500, height: 1100 }, locale: 'de-DE', ignoreHTTPSErrors: true })
const seite = await kontext.newPage()

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
    '/mappings/new',
    '/reviews',
    zurPruefung,
    '/users',
    zumNutzer,
    '/profile'
  ].filter((x) => x !== null)

  /* ------------------------------------------------------ Seiten im Ruhezustand */
  for (const pfad of seiten) {
    await seite.goto(BASIS + pfad, { waitUntil: 'networkidle' })
    if (pfad === zurZuordnung) await seite.waitForSelector('table.maptable', { timeout: 30000 })
    await seite.waitForTimeout(2500)
    for (const schema of SCHEMATA) {
      await seite.evaluate((s) => document.documentElement.setAttribute('data-theme', s), schema)
      await seite.waitForTimeout(400)
      await pruefe(seite, `${pfad} [${schema}]`)
    }
  }

  /* ------------------------------------------------------ Geoeffnete Zustaende */
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

  if (zurZuordnung !== null) {
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
  }

  if (zumDatensatz !== null) {
    await seite.goto(BASIS + zumDatensatz, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(3000)
    const jsonKnopf = seite.locator('button[aria-controls="record-json"]').first()
    if (await jsonKnopf.count()) {
      await jsonKnopf.click()
      await seite.waitForTimeout(600)
    }
    for (const reiter of ['manifestations', 'items']) {
      const knopf = seite.locator(`#tab-${reiter}`)
      if (await knopf.count()) {
        await knopf.click()
        await seite.waitForTimeout(900)
        await pruefe(seite, `${zumDatensatz} · Reiter ${reiter}`)
      }
    }
  }
} finally {
  await browser.close()
}

console.log(`\n${geprueft} Staende geprueft.`)
if (befunde.length > 0) {
  console.log(`NICHT BESTANDEN — ${befunde.length} Befund(e) ab "serious":`)
  for (const b of befunde) console.log('  ' + b)
  process.exit(1)
}
console.log('BESTANDEN — kein Befund der Schwere "serious" oder "critical".')
