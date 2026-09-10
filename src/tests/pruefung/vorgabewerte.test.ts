/*
 * Erkennt die Anwendung ihre eigenen Vorgabewerte?
 *
 * Anlass am 09.09.2026: Die oeffentlich erreichbare Testinstanz lief mit
 * `SESSION_SECRET` auf dem Vorgabewert, `DB_PASS` auf `avefi` und dem
 * Administratorpasswort `changeme` aus `docs/barrierefreiheit.md`. Alle drei
 * Punkte standen zu dem Zeitpunkt bereits richtig in `docs/deployment.md`.
 *
 * Der Test haelt vor allem die Liste der bekannten Werte fest. Sie ist der Teil,
 * der veraltet: Wer einen neuen Platzhalter in eine Beispieldatei schreibt und
 * ihn hier nicht ergaenzt, baut die Luecke wieder ein, die es gerade zu
 * schliessen galt.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  VORGABE_DB_PASS, VORGABE_PASSWOERTER, VORGABE_SESSION_SECRET,
  protokollzeile, pruefeUmgebung
} from '../../server/lib/vorgabewerte'

const wurzel = fileURLToPath(new URL('../..', import.meta.url))
const lies = (pfad: string): string => readFileSync(join(wurzel, pfad), 'utf8')

const GESICHERT = { ...process.env }
afterEach(() => { process.env = { ...GESICHERT } })

function umgebung(werte: Record<string, string | undefined>) {
  process.env = { ...GESICHERT, ...werte } as NodeJS.ProcessEnv
}

describe('Vorgabewerte erkennen', () => {
  it('meldet nichts bei eigenen Werten', () => {
    umgebung({
      NODE_ENV: 'development',
      SESSION_SECRET: 'x9Q2vLk8sT1pR4wZ7nB3mF6hJ0dC5gYaEuIoPqRsTuVw',
      DB_PASS: 'nicht-die-vorgabe'
    })
    expect(pruefeUmgebung()).toEqual([])
  })

  it('erkennt jeden bekannten Platzhalter des Sitzungsgeheimnisses', () => {
    for (const wert of VORGABE_SESSION_SECRET) {
      umgebung({ NODE_ENV: 'development', SESSION_SECRET: wert, DB_PASS: 'eigen' })
      const codes = pruefeUmgebung().map((b) => b.code)
      expect(codes, `${wert} wurde nicht erkannt`).toContain('session_secret')
    }
  })

  it('wertet die ungesetzte Variable wie den Vorgabewert', () => {
    // Ungesetzt heisst nicht "harmlos", sondern "es gilt die Vorgabe".
    umgebung({ NODE_ENV: 'development', SESSION_SECRET: undefined, NUXT_SESSION_SECRET: undefined,
      DB_PASS: undefined, NUXT_DB_PASS: undefined })
    const codes = pruefeUmgebung().map((b) => b.code)
    expect(codes).toContain('session_secret')
    expect(codes).toContain('db_pass')
  })

  it('bricht nur im Auslieferungsbetrieb ab, und nur beim Sitzungsgeheimnis', () => {
    umgebung({ NODE_ENV: 'production', SESSION_SECRET: 'entwicklung-bitte-setzen', DB_PASS: 'avefi' })
    const befunde = pruefeUmgebung()
    expect(befunde.find((b) => b.code === 'session_secret')?.schwere).toBe('abbruch')
    // Die Datenbank haengt im internen Netz; ein Abbruch waere hier unverhaeltnismaessig.
    expect(befunde.find((b) => b.code === 'db_pass')?.schwere).toBe('warnung')
  })

  it('warnt im Entwicklungsbetrieb, statt sich selbst auszusperren', () => {
    umgebung({ NODE_ENV: 'development', SESSION_SECRET: 'entwicklung-bitte-setzen', DB_PASS: 'avefi' })
    expect(pruefeUmgebung().every((b) => b.schwere === 'warnung')).toBe(true)
  })

  it('nennt im Protokoll den Weg zum eigenen Wert', () => {
    const zeile = protokollzeile({ code: 'session_secret', schwere: 'warnung' })
    expect(zeile).toContain('openssl rand')
  })

  it('findet kein Passwort in der Dokumentation', () => {
    /*
     * Die Umkehrung des urspruenglichen Tests, und der Grund dafuer steht in
     * der Datei selbst: Bis zum 10.09.2026 nannte docs/barrierefreiheit.md an
     * vier Stellen ein Konto samt Passwort als Beispiel fuer die Testlaeufe.
     * Der Wert war der echte Zugang der Demo-Instanz, und mit dem Uebertrag an
     * die Organisation AV-EFI wurde das Repository oeffentlich.
     *
     * Seitdem kommen die Werte aus der Umgebung. Dieser Test haelt das fest:
     * Wer wieder einen Wert einsetzt, damit der Aufruf zum Kopieren taugt,
     * bekommt einen roten Test statt eines veroeffentlichten Zugangs.
     */
    const doku = lies('docs/barrierefreiheit.md')
    const treffer = [...doku.matchAll(/(?:A11Y|OBF)_(?:PASS|USER)=(?!"?\$)([^\s\\]+)/g)].map((m) => m[1])
    expect(treffer, `Zugangsdaten stehen wieder in der Anleitung: ${treffer.join(', ')}`).toEqual([])
  })

  it('behaelt die bekannten Passwoerter in der Liste', () => {
    // Aus der Doku entfernt heisst nicht aus der Welt: Solange irgendwo eine
    // Instanz mit einem dieser Werte laeuft, soll der Start es sagen.
    expect(VORGABE_PASSWOERTER).toContain('changeme')
  })

  it('kennt den Vorgabewert aus nuxt.config.ts', () => {
    const cfg = lies('nuxt.config.ts')
    const secret = /sessionSecret:.*?\|\|\s*'([^']+)'/.exec(cfg)?.[1]
    const dbPass = /dbPass:.*?\|\|\s*'([^']+)'/.exec(cfg)?.[1]
    expect(secret).toBeTruthy()
    expect(VORGABE_SESSION_SECRET).toContain(secret as string)
    expect(VORGABE_DB_PASS).toContain(dbPass as string)
  })

  it('kennt den Platzhalter aus .env.example', () => {
    const bsp = lies('.env.example')
    const secret = /^SESSION_SECRET=(.+)$/m.exec(bsp)?.[1]
    const dbPass = /^DB_PASS=(.+)$/m.exec(bsp)?.[1]
    expect(VORGABE_SESSION_SECRET).toContain(secret as string)
    expect(VORGABE_DB_PASS).toContain(dbPass as string)
  })
})
