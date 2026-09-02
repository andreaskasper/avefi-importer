/*
 * Zeitpunkte kommen aus einer Hand.
 *
 * Der Server rechnet in der Zeitzone des Containers (UTC), der Browser in der
 * des Betrachters. Wer beim Aufbau der Seite anders formatiert als danach im
 * Browser, erzeugt einen Hydrationsfehler — und fuer einen Moment steht die
 * falsche Uhrzeit da. Am 02.09.2026 auf /users nachgestellt: Server 13:20,
 * Browser 15:20.
 *
 * Luca Wollny hatte am 01.09.2026 einen Vue-Fehler auf genau dieser Seite
 * gemeldet. Er war damals nicht nachstellbar und wurde ausdruecklich nicht als
 * behoben verbucht.
 *
 * Die Loesung gab es schon: TimeStamp.vue formatierte beim Aufbau in UTC und
 * stellte erst nach dem Laden um. Acht andere Stellen riefen `formatDateTime`
 * trotzdem direkt auf, und eine Seite trug eine zweite, eigene Umsetzung. Die
 * Logik liegt jetzt in `useDateTime()`; dieser Test haelt fest, dass niemand
 * daran vorbeigeht.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const app = fileURLToPath(new URL('../../app', import.meta.url))

/**
 * Die beiden Stellen, an denen die Formatierung zu Hause ist.
 *
 * `format.ts` kann die Zeitzone entgegennehmen, `useDateTime.ts` entscheidet,
 * welche gilt. Wer hier etwas eintraegt, uebernimmt diese Entscheidung selbst.
 */
const ZUSTAENDIG = new Set([
  'components/imports/format.ts',
  'composables/useDateTime.ts'
])

function dateien(verzeichnis: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const voll = join(verzeichnis, eintrag)
    if (statSync(voll).isDirectory()) dateien(voll, gesammelt)
    else if (/\.(vue|ts)$/.test(eintrag)) gesammelt.push(voll)
  }
  return gesammelt
}

describe('Zeitpunkte', () => {
  it('werden nirgends an useDateTime vorbei formatiert', () => {
    const treffer: string[] = []
    for (const pfad of dateien(app)) {
      const kurz = pfad.slice(app.length + 1).replaceAll('\\', '/')
      if (ZUSTAENDIG.has(kurz)) continue
      const inhalt = readFileSync(pfad, 'utf8')
      inhalt.split('\n').forEach((zeile, i) => {
        if (/\bformatDateTime\s*\(/.test(zeile)) treffer.push(`${kurz}:${i + 1}`)
      })
    }
    expect(treffer, 'stattdessen useDateTime() oder <ImportsTimeStamp>').toEqual([])
  })

  it('haben nur eine Umsetzung', () => {
    const treffer: string[] = []
    for (const pfad of dateien(app)) {
      const kurz = pfad.slice(app.length + 1).replaceAll('\\', '/')
      if (kurz === 'components/imports/format.ts') continue
      if (/function\s+formatDateTime|const\s+formatDateTime\s*=/.test(readFileSync(pfad, 'utf8'))) treffer.push(kurz)
    }
    expect(treffer, 'eine zweite Umsetzung driftet von der ersten weg').toEqual([])
  })

  it('nennen die Zeitzone, wenn sie beim Aufbau formatiert werden', () => {
    const quelle = readFileSync(join(app, 'composables/useDateTime.ts'), 'utf8')
    // Vor dem Einhaengen UTC, danach Ortszeit. Faellt eine der beiden Haelften
    // weg, ist der Hydrationsfehler zurueck, ohne dass ein Test rot wird.
    expect(quelle).toMatch(/'UTC'/)
    expect(quelle).toMatch(/onMounted/)
  })
})
