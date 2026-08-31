/**
 * Oberflaeche in Textbeschreibungen ueberfuehren.
 *
 * Faehrt dieselben Seiten an wie tests/a11y/axe.mjs, meldet sich mit demselben
 * Muster an und schreibt je Seite eine Beschreibung in Markdown sowie einen
 * Bildschirmabzug nach docs/oberflaeche/.
 *
 * Zweck: Wer die Anwendung nicht sieht, soll sie trotzdem erfassen und
 * mitreden koennen. Die Beschreibung nennt Landmarken, Ueberschriften,
 * Tab-Reihenfolge, Formularfelder, Tabellen, Live-Bereiche und Bilder, dazu
 * am Ende einen kurzen Absatz zur raeumlichen Anordnung.
 *
 * axe.mjs prueft gegen Regeln. Dieses Skript prueft nichts, es beschreibt.
 * Beides zusammen ergibt das Bild.
 *
 * Der Aufruf steht in docs/barrierefreiheit.md.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASIS = process.env.OBF_BASE ?? 'http://localhost:3000'
const NUTZER = process.env.OBF_USER ?? 'admin@av-efi.net'
const PASSWORT = process.env.OBF_PASS ?? 'changeme'
const ZIEL = process.env.OBF_OUT ?? 'docs/oberflaeche'
const BREITE = Number(process.env.OBF_WIDTH ?? 1500)
const HOEHE = Number(process.env.OBF_HEIGHT ?? 1100)
const MAX_TABS = Number(process.env.OBF_MAXTABS ?? 400)
/* Liegt .git ausserhalb des eingehaengten Verzeichnisses, kommt der Commit von aussen. */
const COMMIT = process.env.OBF_COMMIT ?? ''

/* ------------------------------------------------------------------ Werkzeuge im Browser */

/**
 * Wird vor jedem Seitenaufbau eingespielt und stellt window.__obf bereit.
 * Alles hier drin laeuft im Browser und darf nichts von aussen erwarten.
 */
function werkzeuge() {
  const W = {}

  /** Rollen, deren Name aus dem eigenen Inhalt kommt. */
  const AUS_INHALT = new Set(['button', 'link', 'summary', 'heading', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'tab', 'option', 'treeitem', 'switch', 'checkbox', 'radio',
    'columnheader', 'rowheader', 'cell', 'gridcell', 'tooltip'])

  /*
   * Text so lesen, wie ein Vorlesewerkzeug ihn liest. innerText genuegt dafuer
   * nicht: es nimmt auch mit, was per aria-hidden ausgeblendet ist — etwa die
   * Zierzeichen vor einer Beschriftung. Die gehoeren nicht in den Namen.
   */
  W.txt = (el) => {
    if (!el) return ''
    if (el.nodeType !== 1) return (el.textContent || '').replace(/\s+/g, ' ').trim()
    const teile = []
    const gehe = (n) => {
      if (n.nodeType === 3) { teile.push(n.nodeValue); return }
      if (n.nodeType !== 1) return
      if (n.getAttribute('aria-hidden') === 'true') return
      if (n.hasAttribute('hidden')) return
      const tag = n.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      let cs = null
      try { cs = getComputedStyle(n) } catch { cs = null }
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return
      const block = cs ? !/^(inline|contents|ruby)/.test(cs.display) : false
      if (block) teile.push(' ')
      for (const k of n.childNodes) gehe(k)
      if (block) teile.push(' ')
    }
    gehe(el)
    return teile.join('').replace(/\s+/g, ' ').trim()
  }

  W.sichtbar = (el) => {
    if (!el || !el.isConnected || el.nodeType !== 1) return false
    if (el.closest('[aria-hidden="true"]')) return false
    if (el.closest('[hidden]')) return false
    let cs
    try { cs = getComputedStyle(el) } catch { return false }
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return false
    return true
  }

  W.rect = (el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      b: Math.round(r.width),
      h: Math.round(r.height)
    }
  }

  W.rolle = (el) => {
    const r = (el.getAttribute('role') || '').trim().split(/\s+/)[0]
    if (r) return r
    const tag = el.tagName.toLowerCase()
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic'
    if (tag === 'button') return 'button'
    if (tag === 'summary') return 'summary'
    if (tag === 'select') return el.multiple || Number(el.size) > 1 ? 'listbox' : 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase()
      if (t === 'checkbox') return 'checkbox'
      if (t === 'radio') return 'radio'
      if (t === 'range') return 'slider'
      if (t === 'number') return 'spinbutton'
      if (t === 'search') return 'searchbox'
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button'
      if (t === 'file') return 'dateiauswahl'
      if (t === 'password') return 'passwortfeld'
      return 'textbox'
    }
    if (/^h[1-6]$/.test(tag)) return 'heading'
    if (tag === 'img') return 'img'
    if (tag === 'nav') return 'navigation'
    if (tag === 'main') return 'main'
    if (tag === 'header') return el.parentElement && el.closest('main, article, section, aside') ? 'generic' : 'banner'
    if (tag === 'footer') return el.closest('main, article, section, aside') ? 'generic' : 'contentinfo'
    if (tag === 'aside') return 'complementary'
    if (tag === 'form') return 'form'
    if (tag === 'section') return 'region'
    if (tag === 'table') return 'table'
    if (tag === 'details') return 'group'
    if (tag === 'output') return 'status'
    if (tag === 'dialog') return 'dialog'
    return 'generic'
  }

  /** Zugaenglicher Name samt Herkunft — die Herkunft verraet die schwachen Stellen. */
  W.name2 = (el) => {
    if (!el || el.nodeType !== 1) return { text: '', quelle: 'kein' }
    const lb = el.getAttribute('aria-labelledby')
    if (lb) {
      const t = lb.trim().split(/\s+/).map((id) => {
        const n = document.getElementById(id)
        return n ? W.txt(n) : ''
      }).filter(Boolean).join(' ').trim()
      if (t) return { text: t, quelle: 'aria-labelledby' }
    }
    const al = el.getAttribute('aria-label')
    if (al && al.trim()) return { text: al.trim(), quelle: 'aria-label' }

    const tag = el.tagName.toLowerCase()
    const rolle = W.rolle(el)

    if (tag === 'img') {
      const a = el.getAttribute('alt')
      if (a !== null) return { text: a.trim(), quelle: 'alt' }
    }
    if (tag === 'svg') {
      const t2 = el.querySelector('title')
      if (t2) return { text: W.txt(t2), quelle: 'svg-title' }
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.id) {
        let l = null
        try { l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]') } catch { l = null }
        if (l) return { text: W.txt(l), quelle: 'label' }
      }
      const w = el.closest('label')
      if (w) return { text: W.txt(w), quelle: 'umgebendes label' }
      const typ = (el.getAttribute('type') || '').toLowerCase()
      if (typ === 'submit' || typ === 'button' || typ === 'reset') {
        const v = el.value
        if (v) return { text: String(v).trim(), quelle: 'value' }
      }
      const ph = el.getAttribute('placeholder')
      if (ph && ph.trim()) return { text: ph.trim(), quelle: 'placeholder' }
      const ti = el.getAttribute('title')
      if (ti && ti.trim()) return { text: ti.trim(), quelle: 'title' }
      return { text: '', quelle: 'kein' }
    }
    if (tag === 'fieldset') {
      const lg = el.querySelector('legend')
      if (lg) return { text: W.txt(lg), quelle: 'legend' }
    }
    if (tag === 'table') {
      const c = el.querySelector('caption')
      if (c) return { text: W.txt(c), quelle: 'caption' }
      return { text: '', quelle: 'kein' }
    }
    if (AUS_INHALT.has(rolle)) {
      const inhalt = W.txt(el)
      if (inhalt) return { text: inhalt, quelle: 'Inhalt' }
      const st = el.querySelector('svg title')
      if (st) return { text: W.txt(st), quelle: 'svg-title' }
    }
    const ti = el.getAttribute('title')
    if (ti && ti.trim()) return { text: ti.trim(), quelle: 'title' }
    return { text: '', quelle: 'kein' }
  }

  W.pfad = (el) => {
    const teile = []
    let n = el
    while (n && n.nodeType === 1 && teile.length < 6) {
      let s = n.tagName.toLowerCase()
      if (n.id) { teile.unshift(s + '#' + n.id); break }
      const kl = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0]
      if (kl) s += '.' + kl
      const p = n.parentElement
      if (p) {
        const gleiche = Array.from(p.children).filter((c) => c.tagName === n.tagName)
        if (gleiche.length > 1) s += ':' + (gleiche.indexOf(n) + 1)
      }
      teile.unshift(s)
      n = n.parentElement
    }
    return teile.join('>')
  }

  const LM_ROLLEN = new Set(['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'search', 'form'])

  const BRAUCHT_NAMEN = new Set(['region', 'form'])
  W.bereich = (el) => {
    let n = el.parentElement
    while (n) {
      const r = W.rolle(n)
      if (LM_ROLLEN.has(r)) {
        const nm = W.name2(n).text
        if (nm) return r + ' „' + nm + '"'
        if (!BRAUCHT_NAMEN.has(r)) return r
      }
      n = n.parentElement
    }
    return ''
  }

  W.beschreibung = (el) => {
    const db = el.getAttribute('aria-describedby')
    if (!db) return null
    return db.trim().split(/\s+/).map((id) => {
      const n = document.getElementById(id)
      return { id, gefunden: !!n, text: n ? W.txt(n).slice(0, 200) : '' }
    })
  }

  W.aktiv = () => {
    const el = document.activeElement
    if (!el || el === document.body || el === document.documentElement) return null
    const n = W.name2(el)
    return {
      tag: el.tagName.toLowerCase(),
      rolle: W.rolle(el),
      name: n.text,
      quelle: n.quelle,
      pfad: W.pfad(el),
      rect: W.rect(el),
      deaktiviert: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      aktuell: el.getAttribute('aria-current') || '',
      erweitert: el.getAttribute('aria-expanded') || '',
      haspopup: el.getAttribute('aria-haspopup') || '',
      tabindex: el.getAttribute('tabindex') || '',
      bereich: W.bereich(el),
      beschreibung: W.beschreibung(el)
    }
  }
  window.__obf = W
}

/** Zweiter Teil der Browser-Werkzeuge: das eigentliche Einsammeln. */
function sammler() {
  const W = window.__obf
  const LM_ROLLEN = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'search', 'form']
  const BRAUCHT_NAMEN = new Set(['region', 'form'])

  const FOKUS = 'a[href],area[href],button,input,select,textarea,summary,iframe,' +
    'audio[controls],video[controls],[tabindex],[contenteditable=""],[contenteditable="true"]'

  W.sammle = (sel) => {
    const wurzel = sel ? document.querySelector(sel) : document
    if (!wurzel) return null
    const q = (s) => {
      try { return Array.from(wurzel.querySelectorAll(s)) } catch { return [] }
    }

    /* ---- Landmarken in Dokumentreihenfolge */
    const lmSel = 'header,nav,main,footer,aside,section,form,[role=banner],[role=navigation],' +
      '[role=main],[role=contentinfo],[role=complementary],[role=region],[role=search],[role=form]'
    const landmarken = []
    for (const el of q(lmSel)) {
      if (!W.sichtbar(el)) continue
      const rolle = W.rolle(el)
      if (LM_ROLLEN.indexOf(rolle) < 0) continue
      const name = W.name2(el).text
      if (BRAUCHT_NAMEN.has(rolle) && !name) continue
      let tiefe = 0
      let n = el.parentElement
      while (n) {
        if (LM_ROLLEN.indexOf(W.rolle(n)) >= 0) tiefe++
        n = n.parentElement
      }
      landmarken.push({ rolle, name, tiefe, rect: W.rect(el), pfad: W.pfad(el) })
    }

    /* ---- Ueberschriften */
    const ueberschriften = q('h1,h2,h3,h4,h5,h6,[role=heading]').filter(W.sichtbar).map((el) => {
      const al = el.getAttribute('aria-level')
      const tag = el.tagName.toLowerCase()
      const stufe = al ? Number(al) : (/^h[1-6]$/.test(tag) ? Number(tag[1]) : 2)
      return { stufe, text: W.name2(el).text || W.txt(el), bereich: W.bereich(el), pfad: W.pfad(el) }
    })

    /* ---- Formularfelder */
    const feldSel = 'input,select,textarea,[role=combobox],[role=textbox],[role=checkbox],' +
      '[role=radio],[role=switch],[role=spinbutton],[role=searchbox]'
    const felder = []
    for (const el of q(feldSel)) {
      const typ = (el.getAttribute('type') || '').toLowerCase()
      if (typ === 'hidden') continue
      if (!W.sichtbar(el)) continue
      const n = W.name2(el)
      felder.push({
        name: n.text,
        quelle: n.quelle,
        rolle: W.rolle(el),
        typ: typ || (el.tagName.toLowerCase() === 'input' ? 'text' : el.tagName.toLowerCase()),
        pflicht: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        ungueltig: el.getAttribute('aria-invalid') === 'true',
        nurlesen: el.hasAttribute('readonly') || el.getAttribute('aria-readonly') === 'true',
        deaktiviert: el.disabled === true,
        autocomplete: el.getAttribute('autocomplete') || '',
        beschreibung: W.beschreibung(el),
        bereich: W.bereich(el),
        pfad: W.pfad(el)
      })
    }

    /* ---- Tabellen */
    const tabellen = []
    for (const el of q('table,[role=table],[role=grid],[role=treegrid]')) {
      if (!W.sichtbar(el)) continue
      const caption = el.querySelector(':scope > caption')
      const kopfZeile = el.querySelector('thead tr') || el.querySelector('tr')
      const kopf = kopfZeile ? Array.from(kopfZeile.querySelectorAll('th,td')).map((c) => ({
        text: W.txt(c),
        scope: c.getAttribute('scope') || '',
        istTh: c.tagName.toLowerCase() === 'th'
      })) : []
      const koerper = el.querySelector('tbody')
      const zeilen = koerper
        ? koerper.querySelectorAll(':scope > tr').length
        : Math.max(0, el.querySelectorAll('tr').length - (el.querySelector('thead') ? 1 : 0))
      let spalten = kopf.length
      const ersteKoerperzeile = koerper ? koerper.querySelector(':scope > tr') : null
      if (ersteKoerperzeile) {
        let s = 0
        for (const c of ersteKoerperzeile.children) s += Number(c.getAttribute('colspan') || 1)
        spalten = Math.max(spalten, s)
      }
      tabellen.push({
        name: W.name2(el).text,
        hatCaption: !!caption,
        captionText: caption ? W.txt(caption) : '',
        spalten,
        zeilen,
        kopf,
        bereich: W.bereich(el),
        pfad: W.pfad(el)
      })
    }

    /* ---- Live-Bereiche */
    const live = []
    for (const el of q('[aria-live],[role=status],[role=alert],[role=log],[role=progressbar],output')) {
      const rolle = W.rolle(el)
      const art = el.getAttribute('aria-live') ||
        (rolle === 'alert' ? 'assertive (aus role=alert)' : rolle === 'status' || rolle === 'output' ? 'polite (aus role)' : 'polite')
      live.push({
        rolle,
        art,
        atomic: el.getAttribute('aria-atomic') || '',
        relevant: el.getAttribute('aria-relevant') || '',
        sichtbar: W.sichtbar(el),
        inhalt: W.txt(el).slice(0, 300),
        pfad: W.pfad(el)
      })
    }

    /* ---- Bilder und Symbole */
    const bilder = []
    for (const el of q('img,svg,[role=img],[role=presentation],[role=none]')) {
      const tag = el.tagName.toLowerCase()
      const rolle = (el.getAttribute('role') || '').toLowerCase()
      const versteckt = el.getAttribute('aria-hidden') === 'true' || !!el.closest('[aria-hidden="true"]')
      const altAttr = tag === 'img' ? el.getAttribute('alt') : null
      const n = W.name2(el)
      const dekorativ = versteckt || rolle === 'presentation' || rolle === 'none' || altAttr === ''
      bilder.push({
        tag,
        dekorativ,
        fehlendesAlt: tag === 'img' && altAttr === null && !versteckt && rolle !== 'presentation' && rolle !== 'none',
        text: n.text,
        quelle: n.quelle,
        quelldatei: tag === 'img' ? (el.getAttribute('src') || '').split('/').pop() : '',
        pfad: W.pfad(el)
      })
    }

    /* ---- Bedienelemente ohne Tastaturweg und sonstige Auffaelligkeiten */
    const bedien = []
    for (const el of q('button,a[href],[role=button],[role=link],[role=menuitem],[role=tab],summary')) {
      if (!W.sichtbar(el)) continue
      const n = W.name2(el)
      bedien.push({
        rolle: W.rolle(el),
        name: n.text,
        quelle: n.quelle,
        bereich: W.bereich(el),
        inTabelle: !!el.closest('table'),
        pfad: W.pfad(el)
      })
    }

    /* ---- Verweise, die ins Leere zeigen */
    const idZaehler = {}
    for (const el of document.querySelectorAll('[id]')) idZaehler[el.id] = (idZaehler[el.id] || 0) + 1
    const doppelteIds = Object.keys(idZaehler).filter((k) => idZaehler[k] > 1).map((k) => ({ id: k, n: idZaehler[k] }))
    const leereLabels = Array.from(document.querySelectorAll('label[for]'))
      .filter((l) => !document.getElementById(l.getAttribute('for')))
      .map((l) => ({ fuer: l.getAttribute('for'), text: W.txt(l) }))

    /* ---- Raum */
    const raum = {
      fensterBreite: window.innerWidth,
      fensterHoehe: window.innerHeight,
      seitenHoehe: Math.round(document.documentElement.scrollHeight),
      seitenBreite: Math.round(document.documentElement.scrollWidth),
      titel: document.title,
      sprache: document.documentElement.getAttribute('lang') || '',
      schema: document.documentElement.getAttribute('data-theme') || 'nicht gesetzt'
    }

    return { landmarken, ueberschriften, felder, tabellen, live, bilder, bedien, doppelteIds, leereLabels, raum }
  }
}

/* ------------------------------------------------------------------ Benennung */

const ROLLE_DE = {
  button: 'Schaltflaeche', link: 'Link', textbox: 'Eingabefeld', passwortfeld: 'Passwortfeld',
  searchbox: 'Suchfeld', combobox: 'Auswahlfeld', listbox: 'Listenfeld', checkbox: 'Kontrollkaestchen',
  radio: 'Optionsfeld', switch: 'Schalter', slider: 'Schieberegler', spinbutton: 'Zahlenfeld',
  dateiauswahl: 'Dateiauswahl', summary: 'aufklappbare Ueberschrift', heading: 'Ueberschrift',
  tab: 'Reiter', tablist: 'Reiterleiste', tabpanel: 'Reiterinhalt', menuitem: 'Menueeintrag',
  menu: 'Menue', option: 'Listeneintrag', img: 'Bild', banner: 'Kopfbereich',
  navigation: 'Navigation', main: 'Hauptbereich', contentinfo: 'Fussbereich',
  complementary: 'Nebenbereich', region: 'Bereich', search: 'Suchbereich', form: 'Formular',
  table: 'Tabelle', grid: 'Gitter', treegrid: 'Baumgitter', status: 'Statusbereich',
  alert: 'Meldungsbereich', log: 'Protokollbereich', progressbar: 'Fortschrittsanzeige',
  dialog: 'Dialog', group: 'Gruppe', treeitem: 'Baumeintrag', generic: 'Element'
}
const rd = (r) => ROLLE_DE[r] || r

/** Ein Name, so wie er im Text erscheint. */
function zit(s) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'ohne zugaenglichen Namen'
  return '„' + (t.length > 160 ? t.slice(0, 158) + '…' : t) + '"'
}

/* ------------------------------------------------------------------ Raum */

function ort(r, vw, vh) {
  if (r.b >= vw * 0.95) {
    if (r.y + r.h <= vh * 0.35) return 'am oberen Rand ueber die volle Breite'
    if (r.y >= vh) return 'ueber die volle Breite, erst nach dem Scrollen sichtbar'
    return 'ueber die volle Breite'
  }
  const mx = r.x + r.b / 2
  const my = r.y + r.h / 2
  const waag = mx < vw / 3 ? 'links' : mx > (vw * 2) / 3 ? 'rechts' : 'mittig'
  let senk
  if (r.y >= vh) senk = 'erst nach dem Scrollen sichtbar'
  else if (my < vh / 3) senk = 'oben'
  else if (my > (vh * 2) / 3) senk = 'unten'
  else senk = 'auf halber Hoehe'
  if (senk === 'erst nach dem Scrollen sichtbar') return waag + ', ' + senk
  return senk + ' ' + waag
}

function raumtext(d, tabs) {
  const vw = d.raum.fensterBreite
  const vh = d.raum.fensterHoehe
  const s = []
  s.push('Gemessen in einem Fenster von ' + vw + ' mal ' + vh + ' Pixeln. Die Seite ist ' +
    d.raum.seitenHoehe + ' Pixel hoch' +
    (d.raum.seitenHoehe > vh + 40 ? ', muss also gescrollt werden' : ' und passt damit ohne Scrollen') + '.')

  const kopf = d.landmarken.find((l) => l.rolle === 'banner')
  if (kopf) {
    s.push('Der Kopfbereich liegt ' + ort(kopf.rect, vw, vh) + ' und ist ' + kopf.rect.h + ' Pixel hoch.')
  }
  const nav = d.landmarken.filter((l) => l.rolle === 'navigation')
  if (nav.length > 0) {
    const n = nav[0]
    const drin = kopf && n.rect.y < kopf.rect.y + kopf.rect.h
    s.push('Die Navigation ' + (n.name ? zit(n.name) + ' ' : '') + 'sitzt ' +
      (drin ? 'innerhalb der Kopfzeile, ' : '') + ort(n.rect, vw, vh) + '.')
  }
  const haupt = d.landmarken.find((l) => l.rolle === 'main')
  if (haupt) {
    const links = haupt.rect.x
    const rechts = Math.max(0, vw - (haupt.rect.x + haupt.rect.b))
    const mittig = Math.abs(links - rechts) < 40 && links > 20
    s.push('Der Hauptbereich beginnt ' + haupt.rect.y + ' Pixel unter dem Seitenanfang und ist ' +
      haupt.rect.b + ' Pixel breit' +
      (mittig ? '; er ist mittig gesetzt und laesst links und rechts je rund ' + Math.round((links + rechts) / 2) + ' Pixel frei'
              : links > 20 ? '; er beginnt ' + links + ' Pixel vom linken Rand' : '') + '.')
  }
  const rest = d.landmarken.filter((l) => ['complementary', 'region', 'search'].includes(l.rolle))
  for (const l of rest.slice(0, 3)) {
    s.push('Der ' + rd(l.rolle) + ' ' + (l.name ? zit(l.name) + ' ' : '') + 'liegt ' + ort(l.rect, vw, vh) +
      ' und ist ' + l.rect.b + ' Pixel breit.')
  }
  const fuss = d.landmarken.find((l) => l.rolle === 'contentinfo')
  if (fuss) s.push('Der Fussbereich schliesst die Seite ' + ort(fuss.rect, vw, vh) + ' ab.')

  /* Bedienelemente, ueber die in einer Besprechung geredet wird. */
  const oben = tabs.filter((t) => t.rect.y < 120 && t.rect.b > 0)
  const rechtsOben = oben.filter((t) => t.rect.x + t.rect.b > vw * 0.62).sort((a, b) => a.rect.x - b.rect.x)
  if (rechtsOben.length > 0) {
    s.push('Oben rechts stehen, von links nach rechts: ' +
      rechtsOben.slice(0, 5).map((t) => zit(t.name) + ' (' + rd(t.rolle) + ')').join(', ') + '.')
  }
  const linksOben = oben.filter((t) => t.rect.x < vw * 0.35).sort((a, b) => a.rect.x - b.rect.x)
  if (linksOben.length > 0) {
    s.push('Oben links stehen: ' + linksOben.slice(0, 5).map((t) => zit(t.name)).join(', ') + '.')
  }
  const gross = tabs.filter((t) => t.rect.y >= 120 && t.rolle === 'button' && t.rect.b >= 90)
    .sort((a, b) => a.rect.y - b.rect.y)
  if (gross.length > 0) {
    s.push('Die breiten Schaltflaechen im Inhalt sind ' +
      gross.slice(0, 4).map((t) => zit(t.name) + ' (' + ort(t.rect, vw, vh) + ')').join(', ') + '.')
  }
  return s.join(' ')
}

/* ------------------------------------------------------------------ Auffaelligkeiten */

function auffaelligkeiten(d, tabs, ganzeSeite) {
  const a = []
  const global = ganzeSeite !== false

  /* Gleiche Befunde werden zusammengefasst — sonst steht dieselbe Zeile zwanzigmal da. */
  const haeufig = (liste, schluessel, satz) => {
    const gruppe = {}
    for (const x of liste) {
      const k = schluessel(x)
      if (k === null) continue
      if (!gruppe[k]) gruppe[k] = { erstes: x, n: 0 }
      gruppe[k].n++
    }
    for (const k of Object.keys(gruppe)) a.push(satz(gruppe[k].erstes, gruppe[k].n))
  }

  haeufig(d.bedien, (b) => (b.name ? null : b.rolle + '|' + b.bereich),
    (b, n) => 'Ohne zugaenglichen Namen: ' + (n > 1 ? n + ' Elemente der Rolle ' + rd(b.rolle) : rd(b.rolle) +
      ' an der Stelle ' + b.pfad) + (b.bereich ? ' im ' + b.bereich : '') +
      '. Ein Vorlesewerkzeug sagt hier nur die Rolle an.')

  haeufig(d.bedien, (b) => (b.name && b.name.replace(/\s/g, '').length === 1 ? b.rolle + '|' + b.name : null),
    (b, n) => 'Name besteht nur aus einem Zeichen: ' + rd(b.rolle) + ' ' + zit(b.name) +
      (n > 1 ? ', ' + n + ' mal auf der Seite' : ' an der Stelle ' + b.pfad) +
      '. Wird als einzelnes Sonderzeichen vorgelesen und ist nicht zu deuten.')

  haeufig(d.bedien, (b) => {
    const t = (b.name || '').trim()
    if (!t || t.length < 2) return null
    if (/^[\p{L}\p{N}]/u.test(t)) return null
    if (/^[+×✕✓↑↓→←·…"'(\[]/.test(t)) return null
    return t
  }, (b, n) => 'Der Name ' + zit(b.name) + ' beginnt mit einem Zierzeichen' +
    (n > 1 ? ' und kommt ' + n + ' mal vor' : '') +
    '. Ein Vorlesewerkzeug spricht das Zeichen entweder aus oder verschluckt es; ' +
    'beides steht vor dem eigentlichen Namen.')

  /* Gleiche Namen im selben Bereich */
  const gruppen = {}
  for (const b of d.bedien) {
    if (!b.name) continue
    const k = b.bereich + '||' + b.rolle + '||' + b.name
    ;(gruppen[k] = gruppen[k] || []).push(b)
  }
  for (const k of Object.keys(gruppen)) {
    const g = gruppen[k]
    if (g.length < 2) continue
    const teile = k.split('||')
    const inTabelle = g.every((x) => x.inTabelle)
    a.push(g.length + ' mal derselbe Name ' + zit(teile[2]) + ' als ' + rd(teile[1]) +
      (teile[0] ? ' im ' + teile[0] : '') + '.' +
      (inTabelle ? ' Es sind Zeilenaktionen einer Tabelle; beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.'
                 : ' Beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.'))
  }

  /* Ueberschriftenstufen */
  let vorher = 0
  for (const h of d.ueberschriften) {
    if (vorher > 0 && h.stufe > vorher + 1) {
      a.push('Ueberschriftenstufe uebersprungen: nach Stufe ' + vorher + ' folgt Stufe ' + h.stufe +
        ' bei ' + zit(h.text) + '.')
    }
    vorher = h.stufe
  }
  if (global) {
    const h1 = d.ueberschriften.filter((h) => h.stufe === 1)
    if (h1.length === 0) a.push('Keine Ueberschrift der Stufe 1. Der Einstieg ueber die Ueberschriftenliste fehlt.')
    if (h1.length > 1) a.push(h1.length + ' Ueberschriften der Stufe 1: ' + h1.map((h) => zit(h.text)).join(', ') + '.')

    const haupt = d.landmarken.filter((l) => l.rolle === 'main')
    if (haupt.length === 0) a.push('Kein Hauptbereich (main). Der Sprung zum Inhalt fehlt damit.')
    if (haupt.length > 1) a.push(haupt.length + ' Hauptbereiche (main). Es darf nur einer sein.')
    const navs = d.landmarken.filter((l) => l.rolle === 'navigation')
    if (navs.length > 1) {
      const ohne = navs.filter((n) => !n.name)
      if (ohne.length > 0) a.push(navs.length + ' Navigationsbereiche, davon ' + ohne.length +
        ' ohne Namen. Bei mehreren Navigationen braucht jede ein aria-label.')
    }
  }

  /* Formularfelder */
  for (const f of d.felder) {
    if (!f.name) a.push('Formularfeld ohne Beschriftung: ' + rd(f.rolle) + ' (' + f.typ + ') an der Stelle ' + f.pfad + '.')
    else if (f.quelle === 'placeholder') a.push('Feld ' + zit(f.name) + ' ist nur ueber den Platzhalter beschriftet. ' +
      'Der Platzhalter verschwindet beim Tippen und ersetzt kein Label.')
    else if (f.quelle === 'title') a.push('Feld ' + zit(f.name) + ' ist nur ueber title beschriftet.')
    if (f.beschreibung) {
      for (const b of f.beschreibung) {
        if (!b.gefunden) a.push('Feld ' + zit(f.name) + ': aria-describedby zeigt auf die Kennung „' + b.id +
          '", die es auf der Seite nicht gibt. Der Hinweis wird nicht vorgelesen.')
      }
    }
  }

  /* Tabellen */
  for (const t of d.tabellen) {
    if (!t.hatCaption && !t.name) a.push('Tabelle ohne Beschriftung (' + t.spalten + ' Spalten, ' + t.zeilen +
      ' Zeilen) an der Stelle ' + t.pfad + '.')
    const ohneScope = t.kopf.filter((k) => k.istTh && !k.scope)
    if (t.kopf.length > 0 && ohneScope.length === t.kopf.length && t.kopf.length > 1) {
      a.push('Tabelle ' + zit(t.name || t.captionText) + ': keine Spaltenueberschrift hat ein scope-Attribut.')
    }
    const leer = t.kopf.filter((k) => k.istTh && !k.text)
    if (leer.length > 0) a.push('Tabelle ' + zit(t.name || t.captionText) + ': ' + leer.length +
      ' Spaltenueberschrift(en) ohne Text.')
  }

  /* Bilder */
  for (const b of d.bilder) {
    if (b.fehlendesAlt) a.push('Bild ohne alt-Attribut: ' + (b.quelldatei || b.pfad) +
      '. Ein Vorlesewerkzeug liest ersatzweise den Dateinamen.')
  }

  /* Kennungen */
  if (global) for (const i of d.doppelteIds) a.push('Die Kennung „' + i.id + '" kommt ' + i.n +
    ' mal vor. Verweise ueber aria-labelledby oder aria-describedby treffen dann die falsche Stelle.')
  if (global) for (const l of d.leereLabels) a.push('Ein label verweist auf die Kennung „' + l.fuer +
    '", die es nicht gibt' + (l.text ? ' (Text: ' + zit(l.text) + ')' : '') + '.')

  /* Tab-Reihenfolge */
  if (!global) return a.filter((x, i) => a.indexOf(x) === i)
  const positiv = tabs.filter((t) => t.tabindex && Number(t.tabindex) > 0)
  if (positiv.length > 0) a.push(positiv.length + ' Element(e) mit positivem tabindex. Das verbiegt die Reihenfolge ' +
    'gegenueber der Dokumentreihenfolge.')
  const sprung = tabs[0]
  const hatNavigation = d.landmarken.some((l) => l.rolle === 'navigation')
  if (sprung && hatNavigation && !/springen|inhalt|skip/i.test(sprung.name || '')) {
    a.push('Der erste Tabstopp ist ' + zit(sprung.name) + ' und keine Sprungmarke zum Inhalt. ' +
      'Wer die Navigation ueberspringen will, muss sie jedes Mal durchtabben.')
  }
  let rueck = 0
  for (let i = 1; i < tabs.length; i++) {
    if (tabs[i].rect.y + 24 < tabs[i - 1].rect.y) rueck++
  }
  if (rueck > 2) a.push('Die Tab-Reihenfolge springt ' + rueck + ' mal wieder nach oben. Das kann an Spalten liegen, ' +
    'kann aber auch heissen, dass die Reihenfolge nicht der Lesereihenfolge folgt.')

  return a.filter((x, i) => a.indexOf(x) === i)
}

/* ------------------------------------------------------------------ Markdown */

function abschnittLandmarken(d) {
  const z = ['### Landmarken', '']
  if (d.landmarken.length === 0) { z.push('Keine Landmarken. Es gibt keinen Weg, die Seite in Bereiche zu gliedern.', ''); return z }
  z.push('In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:', '')
  for (let i = 0; i < d.landmarken.length; i++) {
    const l = d.landmarken[i]
    const ein = l.tiefe > 0 ? '  '.repeat(Math.min(l.tiefe, 3)) : ''
    z.push(ein + (i + 1) + '. ' + rd(l.rolle) + ' (' + l.rolle + ')' +
      (l.name ? ', Name ' + zit(l.name) : ', ohne Namen') +
      (l.tiefe > 0 ? ' — liegt innerhalb einer anderen Landmarke' : ''))
  }
  z.push('')
  return z
}

function abschnittUeberschriften(d) {
  const z = ['### Ueberschriften', '']
  if (d.ueberschriften.length === 0) { z.push('Keine Ueberschriften.', ''); return z }
  let vorher = 0
  for (const h of d.ueberschriften) {
    const sprung = vorher > 0 && h.stufe > vorher + 1
    z.push('- Stufe ' + h.stufe + ': ' + zit(h.text) +
      (sprung ? ' — **Stufe ' + (vorher + 1) + ' uebersprungen**, davor stand Stufe ' + vorher : ''))
    vorher = h.stufe
  }
  z.push('')
  return z
}

function abschnittTabs(tabs) {
  const z = ['### Tab-Reihenfolge', '']
  if (tabs.length === 0) { z.push('Kein Element ist mit der Tabulatortaste erreichbar.', ''); return z }
  z.push('So werden die Bedienelemente mit der Tabulatortaste erreicht. Die Nummer ist die Zahl der Tastendruecke ab Seitenanfang.', '')
  if (tabs.length >= MAX_TABS) {
    z.push('**Die Liste ist bei ' + MAX_TABS + ' Eintraegen abgeschnitten.** Die Seite hat mehr Tabstopps; ' +
      'wer die vollstaendige Liste braucht, setzt `OBF_MAXTABS` hoeher.', '')
  }
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i]
    const zus = []
    if (t.deaktiviert) zus.push('gesperrt')
    if (t.aktuell && t.aktuell !== 'false') zus.push('als aktuell ausgezeichnet')
    if (t.erweitert) zus.push('aufklappbar, derzeit ' + (t.erweitert === 'true' ? 'offen' : 'zu'))
    if (t.haspopup) zus.push('oeffnet ' + (t.haspopup === 'menu' ? 'ein Menue' : t.haspopup))
    if (t.tabindex && Number(t.tabindex) > 0) zus.push('tabindex ' + t.tabindex)
    if (!t.name) zus.push('**kein zugaenglicher Name**')
    else if (t.quelle === 'placeholder') zus.push('Name nur aus dem Platzhalter')
    else if (t.quelle === 'title') zus.push('Name nur aus title')
    if (t.beschreibung) {
      for (const b of t.beschreibung) {
        zus.push(b.gefunden ? 'Hinweis: ' + zit(b.text) : '**Hinweis zeigt ins Leere (' + b.id + ')**')
      }
    }
    z.push((i + 1) + '. ' + zit(t.name) + ' — ' + rd(t.rolle) +
      (t.bereich ? ', im ' + t.bereich : '') +
      (zus.length ? '. ' + zus.join('; ') : ''))
  }
  z.push('')
  return z
}

function abschnittFelder(d) {
  const z = ['### Formularfelder', '']
  if (d.felder.length === 0) { z.push('Keine Formularfelder.', ''); return z }
  for (const f of d.felder) {
    const teile = [rd(f.rolle)]
    if (f.typ && f.typ !== f.rolle) teile.push('Typ ' + f.typ)
    teile.push(f.pflicht ? 'Pflichtfeld' : 'kein Pflichtfeld')
    if (f.nurlesen) teile.push('nur lesbar')
    if (f.deaktiviert) teile.push('gesperrt')
    if (f.ungueltig) teile.push('als fehlerhaft markiert')
    if (f.autocomplete) teile.push('autocomplete ' + f.autocomplete)
    z.push('- ' + zit(f.name) + ' — ' + teile.join(', ') + '.')
    z.push('  Beschriftung kommt aus: ' + f.quelle + '.')
    if (f.beschreibung) {
      for (const b of f.beschreibung) {
        z.push('  Verknuepfter Hinweis (aria-describedby, Kennung ' + b.id + '): ' +
          (b.gefunden ? (b.text ? zit(b.text) : 'vorhanden, aber ohne Text') : '**zeigt ins Leere, die Kennung gibt es nicht**') + '.')
      }
    } else {
      z.push('  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.')
    }
  }
  z.push('')
  return z
}

function abschnittTabellen(d) {
  const z = ['### Tabellen', '']
  if (d.tabellen.length === 0) { z.push('Keine Tabellen.', ''); return z }
  for (const t of d.tabellen) {
    z.push('- Tabelle mit ' + t.spalten + ' Spalten und ' + t.zeilen + ' Datenzeilen' +
      (t.bereich ? ', im ' + t.bereich : '') + '.')
    z.push('  Beschriftung: ' + (t.hatCaption ? 'caption ' + zit(t.captionText)
      : t.name ? zit(t.name) + ' (ueber aria-label)' : '**keine**') + '.')
    if (t.kopf.length > 0) {
      z.push('  Spaltenueberschriften: ' + t.kopf.map((k, i) => (i + 1) + '. ' +
        (k.text ? zit(k.text) : 'ohne Text') + (k.istTh ? '' : ' (kein th)')).join(', ') + '.')
    } else {
      z.push('  **Keine Spaltenueberschriften.** Die Zellen werden ohne Spaltenbezug vorgelesen.')
    }
  }
  z.push('')
  return z
}

function abschnittLive(d) {
  const z = ['### Live-Bereiche', '']
  if (d.live.length === 0) {
    z.push('Kein Bereich mit aria-live, role="status" oder role="alert". Aenderungen ohne Seitenwechsel bleiben hier stumm.', '')
    return z
  }
  z.push('Das wird angesagt, ohne dass die Seite wechselt:', '')
  for (const l of d.live) {
    z.push('- ' + rd(l.rolle) + ' (' + l.rolle + '), Ansageart ' + l.art +
      (l.atomic ? ', aria-atomic ' + l.atomic : '') + '.')
    z.push('  Aktueller Inhalt: ' + (l.inhalt ? zit(l.inhalt) : 'leer, meldet also gerade nichts') + '.')
    if (!l.sichtbar) z.push('  Der Bereich ist optisch nicht sichtbar und dient nur der Ansage.')
  }
  z.push('')
  return z
}

function abschnittBilder(d) {
  const z = ['### Bilder und Symbole', '']
  if (d.bilder.length === 0) { z.push('Keine Bilder und keine Symbolgrafiken.', ''); return z }
  const dek = d.bilder.filter((b) => b.dekorativ)
  const spr = d.bilder.filter((b) => !b.dekorativ)
  if (spr.length > 0) {
    z.push('Mit Alternativtext:', '')
    for (const b of spr) {
      z.push('- ' + (b.tag === 'svg' ? 'Symbolgrafik' : 'Bild') +
        (b.quelldatei ? ' (' + b.quelldatei + ')' : '') + ': ' +
        (b.text ? zit(b.text) : '**kein Text, obwohl nicht als dekorativ ausgezeichnet**') +
        (b.text ? ' (aus ' + b.quelle + ')' : '') + '.')
    }
    z.push('')
  }
  if (dek.length > 0) {
    z.push(dek.length + ' Grafik' + (dek.length === 1 ? ' ist' : 'en sind') +
      ' ausdruecklich als dekorativ ausgezeichnet (leeres alt, aria-hidden oder role="presentation") und ' +
      (dek.length === 1 ? 'wird' : 'werden') + ' nicht vorgelesen.', '')
  }
  return z
}

function abschnittAuffaellig(a) {
  const z = ['### Auffaelligkeiten', '']
  if (a.length === 0) { z.push('Nichts, was beim Bedienen im Weg steht.', ''); return z }
  z.push('Was beim Bedienen stoert. Das ist eine Beschreibung, keine Wertung nach WCAG — die maschinelle Pruefung steht in `tests/a11y/axe.mjs`.', '')
  for (const x of a) z.push('- ' + x)
  z.push('')
  return z
}

function seiteRendern(seite, d, tabs, zusaetze) {
  const a = auffaelligkeiten(d, tabs)
  const z = []
  z.push('# ' + seite.titel, '')
  z.push('Adresse: `' + seite.pfad + '`  ')
  z.push('Seitentitel im Browser: ' + zit(d.raum.titel) + '  ')
  z.push('Sprache des Dokuments: ' + (d.raum.sprache ? '`' + d.raum.sprache + '`' : '**nicht gesetzt**'), '')
  if (seite.zweck) z.push(seite.zweck, '')
  z.push('## Teil 1 — Was der Screenreader vorfindet', '')
  z.push(...abschnittLandmarken(d))
  z.push(...abschnittUeberschriften(d))
  z.push(...abschnittTabs(tabs))
  z.push(...abschnittFelder(d))
  z.push(...abschnittTabellen(d))
  z.push(...abschnittLive(d))
  z.push(...abschnittBilder(d))
  z.push(...abschnittAuffaellig(a))
  for (const zu of zusaetze || []) z.push(...zu)
  z.push('## Teil 2 — Wie es raeumlich angeordnet ist', '')
  z.push(raumtext(d, tabs), '')
  z.push('Der Bildschirmabzug `' + seite.datei.replace(/\.md$/, '.png') + '` im selben Verzeichnis zeigt denselben Stand ' +
    'fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.', '')
  return z.join('\n')
}

/* ------------------------------------------------------------------ Zuordnungszeile */

/**
 * Die aufgeklappte Zuordnungszeile des Mapping-Editors.
 *
 * Aufgeklappt wird die Zeile mit den meisten Zweigen — an einer leeren Zeile
 * gibt es nichts zu beschreiben. Danach wird die Zeile wieder zugeklappt; die
 * Seite bleibt also so, wie sie war, und gespeichert wird nirgends etwas.
 */
async function zuordnungszeile(seite) {
  const wahl = await seite.evaluate(() => {
    const zeilen = Array.from(document.querySelectorAll('table.maptable tbody tr'))
      .filter((r) => !r.classList.contains('chainrow'))
    let idx = 0
    let best = -1
    zeilen.forEach((r, i) => {
      const n = r.querySelectorAll('.tchips button').length
      if (n > best) { best = n; idx = i }
    })
    return { idx, zweige: best, zeilen: zeilen.length }
  })

  const zeile = seite.locator('table.maptable tbody tr').nth(wahl.idx)
  const zahnrad = zeile.locator('.rowbtns button').first()
  if ((await zahnrad.count()) === 0) return []
  const spalte = (await zahnrad.getAttribute('aria-label')) || ''
  await zahnrad.click()
  await seite.waitForSelector('tr.chainrow', { timeout: 15000 })
  await seite.waitForTimeout(2000)

  const inhalt = await seite.evaluate(() => {
    const w = document.querySelector('tr.chainrow')
    if (!w) return null
    const T = (e) => (e ? window.__obf.txt(e) : '')
    const schritte = (wurzel) => Array.from(wurzel.querySelectorAll(':scope > .step, .step'))
      .map((st) => T(st.querySelector('.step-name'))).filter(Boolean)
    const global = w.querySelector('.branch-global')
    const zweige = Array.from(w.querySelectorAll('.branch-item'))
      .filter((b) => !b.classList.contains('branch-add-item'))
      .map((b) => {
        const kombi = b.querySelector('input[role=combobox]')
        const auth = b.querySelector('.authpanel')
        const kette = b.querySelector('.branch-body > .chain, .chain')
        return {
          nummer: T(b.querySelector('.branch-no')),
          zielFeldName: kombi ? window.__obf.name2(kombi).text : '',
          zielWert: kombi ? kombi.value : '',
          zielHinweis: (() => {
            /* Der Hinweis unter dem Zielfeld setzt sich aus mehreren Stuecken
               zusammen und traegt am Ende eine Schaltflaeche. Ohne Trennung
               laufen die Stuecke im Text ineinander. */
            const n = b.querySelector('.branch-target .note')
            if (!n) return ''
            const stuecke = []
            for (const k of n.childNodes) {
              if (k.nodeType !== 1 && k.nodeType !== 3) continue
              if (k.nodeType === 1 && k.tagName === 'BUTTON') continue
              let t = k.nodeType === 3 ? (k.nodeValue || '').replace(/\s+/g, ' ').trim() : T(k)
              t = t.replace(/^[—–·|,;:]+\s*/, '').replace(/\s*[—–·|,;:]+$/, '').trim()
              if (!t) continue
              stuecke.push(t)
            }
            return stuecke.join(' — ')
          })(),
          ketteLabel: T(b.querySelector('.chain-label')),
          schritte: kette ? schritte(kette) : [],
          ergebnis: Array.from(b.querySelectorAll('.branch-result .exline')).map((e) => {
            const roh = T(e.querySelector('.exraw'))
            const wert = T(e.querySelector('.okval, .errval, .dim'))
            if (!roh && !wert) return T(e)
            return (roh || 'kein Quellwert') + ' wird zu ' + (wert || 'kein Wert')
          }).slice(0, 4),
          knoepfe: Array.from(b.querySelectorAll('button')).map((x) => window.__obf.name2(x).text).filter(Boolean),
          werteliste: auth ? Array.from(auth.querySelectorAll('.authrow')).map(T).slice(0, 6) : null,
          wertelisteZahl: auth ? auth.querySelectorAll('.authrow').length : 0
        }
      })
    const felder = 'a[href],button,input,select,textarea,summary,[tabindex]'
    const reihenfolge = Array.from(w.querySelectorAll(felder))
      .filter((e) => window.__obf.sichtbar(e) && e.getAttribute('tabindex') !== '-1' && !e.disabled)
      .map((e) => ({ name: window.__obf.name2(e).text, rolle: window.__obf.rolle(e) }))
    return {
      quelle: T(w.querySelector('.branch-src')),
      globalLabel: T(global ? global.querySelector('.chain-label') : null),
      globalSchritte: global ? schritte(global) : [],
      globalLeer: global ? !!global.querySelector('.note') : false,
      zweige,
      weitere: T(w.querySelector('.branch-add-item button')),
      hinweis: T(w.querySelector('.branch-add-item .note')),
      reihenfolge
    }
  })

  await zahnrad.click().catch(() => {})
  await seite.waitForTimeout(400)
  if (!inhalt) return []

  const z = ['## Zusaetzlicher Zustand: die aufgeklappte Zuordnungszeile', '']
  z.push('Jede Zeile der Zuordnungstabelle laesst sich aufklappen. Die Schaltflaeche dafuer heisst ' +
    zit(spalte) + ' und ist der vorletzte Tabstopp der Zeile; sie traegt `aria-expanded` und zeigt damit an, ' +
    'ob die Zeile offen ist. Beschrieben ist hier die Zeile mit den meisten Zweigen — von ' + wahl.zeilen +
    ' Zeilen der Tabelle hat sie ' + wahl.zweige + '.', '')
  z.push('Aufgeklappt schiebt sich unter die Zeile eine zweite Tabellenzeile, die sich ueber alle Spalten ' +
    'zieht. Sie ist ueber `aria-controls` mit der Schaltflaeche verbunden. Der Inhalt ist keine Tabelle, ' +
    'sondern eine Abfolge von Bereichen.', '')

  z.push('### Aufbau von oben nach unten', '')
  z.push('1. Die Quellspalte: ' + zit(inhalt.quelle) + '. Das ist reiner Text, kein Bedienelement.')
  z.push('2. Ein Bereich fuer die Konverter, die fuer **alle** Ziele dieser Spalte gelten' +
    (inhalt.globalLabel ? ' — ueberschrieben mit ' + zit(inhalt.globalLabel) : '') + '. ' +
    (inhalt.globalSchritte.length > 0
      ? 'Er enthaelt ' + inhalt.globalSchritte.length + ' Schritt(e): ' + inhalt.globalSchritte.map(zit).join(', ') + '.'
      : 'Er ist leer; der Wert geht unveraendert weiter.') +
    ' Am Ende steht eine Schaltflaeche, die einen weiteren Konverter hinzufuegt.')
  z.push('3. Danach folgt je Ziel ein Zweig. Es sind ' + inhalt.zweige.length + '.')
  z.push('4. Zuletzt die Schaltflaeche ' + zit(inhalt.weitere) + ', die einen weiteren Zweig anlegt.')
  z.push('')

  z.push('### Die Zweige im Einzelnen', '')
  if (inhalt.zweige.length === 0) z.push('Diese Zeile hat keinen Zweig.', '')
  for (const b of inhalt.zweige) {
    z.push('**' + (b.nummer || 'Zweig') + '**', '')
    z.push('- Zielauswahl: ' + (b.zielFeldName ? 'Eingabefeld ' + zit(b.zielFeldName) : 'Eingabefeld ohne Beschriftung') +
      ' mit `role="combobox"`. Der eingetragene Wert ist ' + (b.zielWert ? zit(b.zielWert) : 'leer') + '.')
    if (b.zielHinweis) z.push('- Unter dem Feld steht als Text: ' + zit(b.zielHinweis) +
      '. Dieser Text ist nicht mit dem Feld verknuepft und wird beim Betreten des Feldes nicht mit vorgelesen.')
    z.push('- Konverter nur fuer dieses Ziel' + (b.ketteLabel ? ' (' + zit(b.ketteLabel) + ')' : '') + ': ' +
      (b.schritte.length > 0 ? b.schritte.map(zit).join(', ') : 'keine; der Wert geht unveraendert weiter') + '.')
    if (b.ergebnis.length > 0) {
      z.push('- Beispiele aus den Daten, jeweils Quellwert und Ergebnis:')
      for (const e of b.ergebnis) z.push('  - ' + zit(e))
    }
    if (b.werteliste) {
      z.push('- Eine Werteliste mit ' + b.wertelisteZahl + ' Quellwert(en). Die ersten Zeilen lauten: ' +
        b.werteliste.map(zit).join(' — ') + '.')
    }
    if (b.knoepfe.length > 0) z.push('- Schaltflaechen in diesem Zweig: ' + b.knoepfe.map(zit).join(', ') + '.')
    z.push('')
  }

  if (inhalt.hinweis) z.push('Am Ende steht der Hinweistext ' + zit(inhalt.hinweis) + '.', '')

  z.push('### Reihenfolge der Bedienelemente in der aufgeklappten Zeile', '')
  z.push('Sie kommen unmittelbar nach der Schaltflaeche, mit der aufgeklappt wurde:', '')
  for (let i = 0; i < inhalt.reihenfolge.length; i++) {
    z.push((i + 1) + '. ' + zit(inhalt.reihenfolge[i].name) + ' — ' + rd(inhalt.reihenfolge[i].rolle))
  }
  z.push('')

  const einzeichen = inhalt.reihenfolge.filter((x) => x.name && x.name.replace(/\s/g, '').length === 1)
  const ohne = inhalt.reihenfolge.filter((x) => !x.name)
  if (einzeichen.length > 0 || ohne.length > 0) {
    z.push('### Auffaelligkeiten in der aufgeklappten Zeile', '')
    for (const x of ohne) z.push('- ' + rd(x.rolle) + ' ohne zugaenglichen Namen.')
    for (const x of einzeichen) z.push('- ' + rd(x.rolle) + ' ' + zit(x.name) +
      ': der Name besteht nur aus einem Zeichen.')
    z.push('')
  }
  return [z]
}

/* ------------------------------------------------------------------ Ablauf */

function commitLesen() {
  try {
    const kopf = readFileSync('.git/HEAD', 'utf8').trim()
    if (kopf.startsWith('ref: ')) {
      const ref = kopf.slice(5).trim()
      try { return readFileSync('.git/' + ref, 'utf8').trim().slice(0, 10) } catch { /* gepackt */ }
      const gepackt = readFileSync('.git/packed-refs', 'utf8')
      for (const zeile of gepackt.split('\n')) {
        const teile = zeile.trim().split(' ')
        if (teile[1] === ref) return teile[0].slice(0, 10)
      }
      return ''
    }
    return kopf.slice(0, 10)
  } catch { return '' }
}

async function anmelden(seite) {
  await seite.goto(BASIS + '/login', { waitUntil: 'networkidle' })
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
      const href = a.getAttribute('href') || ''
      if (re.test(href)) return href
    }
    return null
  }, muster)
}

/** Alle Adressen, die zu einem Muster passen — ohne Wiederholungen. */
async function alleAdressen(seite, muster) {
  return seite.evaluate((m) => {
    const re = new RegExp(m)
    const raus = []
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || ''
      if (re.test(href) && raus.indexOf(href) < 0) raus.push(href)
    }
    return raus
  }, muster)
}

/*
 * Die Zuordnung laesst sich nur dann sinnvoll beschreiben, wenn dort auch
 * etwas zugeordnet ist: eine leere Zuordnung hat keine Zweige. Deshalb werden
 * die Kandidaten kurz angesehen und der genommen, der die meisten belegten
 * Ziele hat. Beim ersten Treffer wird abgebrochen, damit das nicht ausufert.
 */
async function besteZuordnung(seite, kandidaten) {
  let beste = kandidaten[0] || null
  let bestzahl = -1
  for (const pfad of kandidaten.slice(0, 8)) {
    try {
      await seite.goto(BASIS + pfad, { waitUntil: 'networkidle', timeout: 45000 })
      await seite.waitForSelector('table.maptable', { timeout: 30000 })
      await seite.waitForTimeout(2500)
      const zahl = await seite.evaluate(() => document.querySelectorAll('table.maptable tbody .tchips').length)
      if (zahl > bestzahl) { bestzahl = zahl; beste = pfad }
      if (zahl > 0) break
    } catch { /* naechster Kandidat */ }
  }
  return beste
}

/**
 * Von allen passenden Adressen die mit der kleinsten Kennung. Ohne das trifft
 * ein zweiter Lauf womoeglich einen anderen Datensatz, und die Beschreibungen
 * unterscheiden sich, obwohl sich an der Oberflaeche nichts geaendert hat.
 */
async function kleinsteAdresse(seite, muster) {
  const alle = await alleAdressen(seite, muster)
  if (alle.length === 0) return null
  const zahl = (a) => {
    const m = a.match(/(\d+)$/)
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
  }
  return alle.slice().sort((a, b) => zahl(a) - zahl(b))[0]
}

async function tabreihenfolge(seite) {
  /*
   * Ein blosses blur() genuegt nicht: Chromium merkt sich, wo der Fokus zuletzt
   * stand, und wandert von dort weiter. Setzt eine Seite den Fokus beim Aufbau
   * selbst (etwa ins erste Feld), fehlte sonst der erste Tabstopp. Der Fokus
   * wird deshalb ausdruecklich auf den Dokumentanfang zurueckgesetzt.
   */
  await seite.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
    document.body.removeAttribute('tabindex')
  })
  const liste = []
  for (let i = 0; i < MAX_TABS; i++) {
    await seite.keyboard.press('Tab')
    let info = null
    try { info = await seite.evaluate(() => window.__obf.aktiv()) } catch { info = null }
    if (!info) break
    if (liste.length > 0 && info.pfad === liste[0].pfad && info.name === liste[0].name) break
    liste.push(info)
  }
  await seite.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur() })
  return liste
}

/**
 * Bildschirmabzug. Sehr lange Seiten werden gekappt — ein Abzug ueber
 * zehntausend Pixel bringt niemandem etwas und kostet den Browser das Leben.
 */
async function abzug(seite, datei) {
  let hoch = HOEHE
  try { hoch = await seite.evaluate(() => document.documentElement.scrollHeight) } catch { /* egal */ }
  const voll = hoch <= 6000
  try {
    await seite.screenshot({ path: ZIEL + '/' + datei, fullPage: voll })
    return true
  } catch (e) {
    try {
      await seite.screenshot({ path: ZIEL + '/' + datei, fullPage: false })
      return true
    } catch (e2) {
      console.log('  Bildschirmabzug fehlgeschlagen: ' + e2.message)
      return false
    }
  }
}

const fehler = []
const geschrieben = []

let browser = null
let seite = null

async function browserStarten() {
  browser = await chromium.launch({
    args: ['--ignore-certificate-errors', '--disable-dev-shm-usage']
  })
  const kontext = await browser.newContext({
    viewport: { width: BREITE, height: HOEHE },
    locale: 'de-DE',
    ignoreHTTPSErrors: true
  })
  await kontext.addInitScript(werkzeuge)
  await kontext.addInitScript(sammler)
  seite = await kontext.newPage()
  browser.on('disconnected', () => console.log('  [Hinweis] Der Browser hat sich beendet.'))
  seite.on('crash', () => console.log('  [Hinweis] Die Seite ist abgestuerzt.'))
  seite.on('pageerror', (e) => { if (String(e).length < 200) console.log('  [Seitenfehler] ' + e.message) })
}

/** Nach einem Absturz von vorn: neuer Browser, neue Anmeldung. */
async function browserSichern() {
  if (browser && browser.isConnected() && seite && !seite.isClosed()) return
  console.log('  Browser war weg — neu gestartet und neu angemeldet.')
  try { if (browser) await browser.close() } catch { /* schon tot */ }
  await browserStarten()
  await anmelden(seite)
  await seite.waitForTimeout(1500)
}

await browserStarten()

mkdirSync(ZIEL, { recursive: true })

try {
  /* -------------------------------------------------- Kennungen aus dem Bestand lesen */
  await anmelden(seite)
  await seite.waitForTimeout(2500)

  const verlinkteZuordnungen = await alleAdressen(seite, '^/imports/[^/]+/mapping$')
  /* Die Kennungen aller Importe, gleich ueber welchen Unterpfad sie verlinkt sind. */
  const importe = (await alleAdressen(seite, '^/imports/[0-9a-f-]{36}(/|$)'))
    .map((a) => a.split('/').slice(0, 3).join('/'))
    .filter((a, i, alle) => alle.indexOf(a) === i)
  /*
   * Nicht jede Zeile der Importliste verlinkt ihre Zuordnung, eine Zuordnung
   * gibt es aber zu jedem Import. Deshalb werden beide Quellen zusammengelegt.
   */
  const zuordnungen = []
  for (const x of importe.map((i) => i + '/mapping').concat(verlinkteZuordnungen)) {
    if (zuordnungen.indexOf(x) < 0) zuordnungen.push(x)
  }
  const zurZuordnung = zuordnungen.length > 0 ? await besteZuordnung(seite, zuordnungen) : null

  /*
   * Alle Seiten rund um einen Import sollen denselben Import zeigen. Massgeblich
   * ist der, dessen Zuordnung sich beschreiben laesst; sonst der erste der Liste.
   */
  await seite.goto(BASIS + '/', { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const ersterImport = (await ersteAdresse(seite, '^/imports/[^/]+')) || ''
  const importId = (zurZuordnung || ersterImport).split('/')[2] || ''
  const zuDatensaetzen = importId ? '/imports/' + importId + '/records' : null

  await seite.goto(BASIS + '/mappings', { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const zumProfil = await kleinsteAdresse(seite, '^/mappings/\\d+$')

  await seite.goto(BASIS + '/reviews', { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const zurPruefung = await kleinsteAdresse(seite, '^/reviews/\\d+$')

  await seite.goto(BASIS + '/users', { waitUntil: 'networkidle' })
  await seite.waitForTimeout(1500)
  const zumNutzer = await kleinsteAdresse(seite, '^/users/\\d+$')

  let zumDatensatz = null
  if (zuDatensaetzen !== null) {
    await seite.goto(BASIS + zuDatensaetzen, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(1800)
    zumDatensatz = await kleinsteAdresse(seite, '^/imports/[^/]+/records/\\d+$')
  }

  const SEITEN = [
    { pfad: '/login', datei: '01-anmeldung.md', titel: 'Anmeldung',
      zweck: 'Der Einstieg. Ohne Kopfzeile und ohne Navigation.', abmelden: true },
    { pfad: '/', datei: '02-importliste.md', titel: 'Importliste',
      zweck: 'Die Startseite nach der Anmeldung. Liste aller Importe und der Weg, eine neue Datei hochzuladen.' },
    { pfad: importId ? '/imports/' + importId : null, datei: '03-importdetails.md', titel: 'Importdetails',
      zweck: 'Ein einzelner Import mit seinem Stand und den Wegen weiter zu Zuordnung, Datensaetzen und Bericht.' },
    { pfad: importId ? '/imports/' + importId + '/report' : null, datei: '04-pruefbericht.md', titel: 'Pruefbericht',
      zweck: 'Was die Pruefung eines Imports ergeben hat.' },
    { pfad: zurZuordnung, datei: '05-mapping-editor.md', titel: 'Mapping-Editor',
      zweck: 'Die wichtigste Seite. Hier wird jede Spalte der Quelldatei einem AVefi-Feld zugeordnet. ' +
        'Die Seite ist die komplexeste der Anwendung; hier verbringt ein Tester die meiste Zeit.',
      warten: 'table.maptable', ruhe: 3500 },
    { pfad: zuDatensaetzen, datei: '06-datensatzliste.md', titel: 'Datensatzliste',
      zweck: 'Die aus einem Import entstandenen Datensaetze als Liste.' },
    { pfad: zumDatensatz, datei: '07-datensatz-detail.md', titel: 'Datensatz im Einzelnen',
      zweck: 'Ein einzelner Datensatz mit Werk, Manifestationen und Exemplaren.', ruhe: 3000 },
    { pfad: '/mappings', datei: '08-zuordnungsliste.md', titel: 'Zuordnungsliste',
      zweck: 'Alle gespeicherten Mappingprofile.' },
    { pfad: zumProfil, datei: '09-profil-detail.md', titel: 'Profil-Detail',
      zweck: 'Ein Mappingprofil zum Ansehen.' },
    { pfad: zumProfil ? zumProfil + '/edit' : null, datei: '10-profil-editor.md', titel: 'Profil-Editor',
      zweck: 'Ein Mappingprofil zum Bearbeiten.', ruhe: 3500 },
    { pfad: '/mappings/new', datei: '11-schema-editor.md', titel: 'Schema-Editor',
      zweck: 'Ein neues Mappingprofil gegen das AVefi-Schema anlegen.', ruhe: 3000 },
    { pfad: zumProfil ? zumProfil + '/normdaten' : null, datei: '17-normdaten.md', titel: 'Normdaten zuordnen',
      zweck: 'Alle Werte eines Profils, zu denen Normdaten gesucht werden, als Arbeitsliste.', ruhe: 3000 },
    { pfad: '/reviews', datei: '12-formatpruefung.md', titel: 'Formatpruefung',
      zweck: 'Die Liste der offenen und erledigten Formatpruefungen.' },
    { pfad: zurPruefung, datei: '13-formatpruefung-detail.md', titel: 'Formatpruefung im Einzelnen',
      zweck: 'Eine einzelne Formatpruefung.' },
    { pfad: '/users', datei: '14-nutzerverwaltung.md', titel: 'Nutzerverwaltung',
      zweck: 'Alle Konten der Anwendung.' },
    { pfad: zumNutzer, datei: '15-nutzer-detail.md', titel: 'Nutzer im Einzelnen',
      zweck: 'Ein einzelnes Konto zum Bearbeiten.' },
    { pfad: '/profile', datei: '16-eigenes-profil.md', titel: 'Eigenes Profil',
      zweck: 'Das eigene Konto: Name, Sprache, Passwort.' }
  ].filter((s) => s.pfad)

  for (const s of SEITEN) {
    console.log('… ' + s.pfad)
    try {
      await browserSichern()
      await seite.goto(BASIS + s.pfad, { waitUntil: 'networkidle', timeout: 45000 })
      if (s.warten) await seite.waitForSelector(s.warten, { timeout: 45000 })
      await seite.waitForTimeout(s.ruhe || 2000)

      const d = await seite.evaluate(() => window.__obf.sammle(null))
      if (!d) throw new Error('Nichts eingesammelt')
      const tabs = await tabreihenfolge(seite)

      const zusaetze = []

      /* Der Mapping-Editor braucht die aufgeklappte Zuordnungszeile. */
      if (s.datei === '05-mapping-editor.md') {
        try {
          zusaetze.push(...await zuordnungszeile(seite))
        } catch (e) {
          console.log('  Zuordnungszeile nicht beschreibbar: ' + e.message)
        }
      }

      const abzugName = s.datei.replace(/\.md$/, '.png')
      await abzug(seite, abzugName)
      writeFileSync(ZIEL + '/' + s.datei, seiteRendern(s, d, tabs, zusaetze) + '\n', 'utf8')
      geschrieben.push({ ...s, anzahlTabs: tabs.length, anzahlMaengel: auffaelligkeiten(d, tabs).length })
      console.log('  ' + s.datei + ' — ' + tabs.length + ' Tabstopps')
    } catch (e) {
      fehler.push(s.titel + ' (' + s.pfad + '): ' + e.message)
      console.log('  FEHLER ' + e.message)
      try { await browserSichern() } catch (e2) { console.log('  Neustart misslungen: ' + e2.message) }
    }
    if (s.abmelden) await anmelden(seite)
  }

  /* -------------------------------------------------- Uebersicht */
  const heute = new Date().toISOString().slice(0, 10)
  const commit = COMMIT || commitLesen()
  const u = []
  u.push('# Die Oberflaeche in Worten', '')
  u.push('Diese Sammlung beschreibt jede Seite des AVefi Importers so, dass man sie ohne Bildschirm ' +
    'erfassen kann. Je Seite gibt es zwei Teile: zuerst, was ein Vorlesewerkzeug vorfindet — Landmarken, ' +
    'Ueberschriften, Tab-Reihenfolge, Formularfelder, Tabellen, Live-Bereiche, Bilder — und danach ein ' +
    'kurzer Absatz zur raeumlichen Anordnung, damit „der Knopf oben rechts" in einer Besprechung eindeutig ist.', '')
  u.push('Die Beschreibungen sind aus der laufenden Anwendung ausgelesen, nicht aus dem Quelltext ' +
    'abgeschrieben. Was hier steht, ist also der Stand, den ein Browser tatsaechlich aufbaut.', '')
  u.push('**Stand:** ' + heute + (commit ? ', Commit `' + commit + '`' : '') + '. Erzeugt gegen `' + BASIS + '`, ' +
    'gemessen in einem Fenster von ' + BREITE + ' mal ' + HOEHE + ' Pixeln.', '')
  u.push('Zu jeder Beschreibung liegt ein Bildschirmabzug mit demselben Dateinamen und der Endung `.png` ' +
    'im selben Verzeichnis. Der ist nicht Teil der Beschreibung, sondern dafuer da, dass Sehende in einer ' +
    'Runde denselben Stand vor Augen haben.', '')
  u.push('## Die Seiten', '')
  for (const g of geschrieben) {
    u.push('- [' + g.titel + '](' + g.datei + ') — `' + g.pfad + '`. ' + (g.zweck || ''))
  }
  u.push('')
  u.push('## Wie die Rollen benannt sind', '')
  u.push('Damit die Beschreibungen ohne Fachbegriffe lesbar bleiben, werden die ARIA-Rollen deutsch benannt. ' +
    'Die Zuordnung:', '')
  for (const k of ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region',
    'button', 'link', 'textbox', 'combobox', 'checkbox', 'heading', 'tab', 'menuitem', 'status', 'alert', 'dialog']) {
    u.push('- `' + k + '` — ' + ROLLE_DE[k])
  }
  u.push('')
  u.push('## Wie das erneuert wird', '')
  u.push('Wenn sich die Oberflaeche aendert, wird `tests/a11y/oberflaeche.mjs` erneut ausgefuehrt; ' +
    'der Aufruf steht in `docs/barrierefreiheit.md`. Alle Dateien in diesem Verzeichnis werden dabei ' +
    'neu geschrieben. Von Hand geaenderte Stellen gehen dabei verloren — Anmerkungen gehoeren deshalb ' +
    'nicht hierher, sondern in die Fehlerliste.', '')
  if (fehler.length > 0) {
    u.push('## Nicht beschreibbar', '')
    u.push('Diese Seiten liessen sich beim letzten Durchlauf nicht beschreiben:', '')
    for (const f of fehler) u.push('- ' + f)
    u.push('')
  }
  writeFileSync(ZIEL + '/README.md', u.join('\n') + '\n', 'utf8')
  console.log('\n' + geschrieben.length + ' Seiten beschrieben, Uebersicht in ' + ZIEL + '/README.md')
} finally {
  try { if (browser) await browser.close() } catch { /* schon zu */ }
}

if (fehler.length > 0) {
  console.log('\nNicht beschreibbar:')
  for (const f of fehler) console.log('  ' + f)
  process.exit(1)
}
