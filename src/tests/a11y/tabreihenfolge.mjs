/*
 * Die zweite Tab-Reihenfolge in die Beschreibungen einarbeiten.
 *
 * oberflaeche.mjs beschreibt eine Fensterbreite je Durchlauf. Die Reihenfolge
 * haengt aber von der Breite ab: Unterhalb von 820 Pixeln liegt die
 * Hauptnavigation hinter einem Aufklappknopf. Eine Beschreibung, die nur eine
 * Breite nennt, behauptet deshalb mehr, als sie weiss — genau die Abweichung,
 * die am 31.08.2026 der Test mit Vorlesewerkzeug gefunden hat.
 *
 * Bis heute wurde die zweite Reihenfolge von Hand hineinkopiert. Beim ersten
 * Neuerzeugen danach war sie wieder weg, ohne dass es jemandem auffiel — ein
 * Handgriff, an den man sich erinnern muss, ist kein Verfahren. Also hier.
 *
 * Aufruf nach beiden Durchlaeufen:
 *   node tests/a11y/tabreihenfolge.mjs docs/oberflaeche /tmp/obf-schmal
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [breitOrdner = 'docs/oberflaeche', schmalOrdner = '/tmp/obf-schmal'] = process.argv.slice(2)

const UEBERSCHRIFT = '### Tab-Reihenfolge'
const VORSPANN = `So werden die Bedienelemente mit der Tabulatortaste erreicht. Die Nummer
ist die Zahl der Tastendruecke ab Seitenanfang.

Die Reihenfolge haengt von der Fensterbreite ab, deshalb stehen hier zwei
Durchlaeufe. Unterhalb von 820 Pixeln liegt die Hauptnavigation hinter einem
Aufklappknopf; darueber steht sie offen in der Kopfzeile. Wer die Darstellung
vergroessert, bekommt die schmale Variante, auch am grossen Bildschirm.`

/** Den Abschnitt „Tab-Reihenfolge" herausschneiden, ohne seinen Vorspann. */
function liste(text) {
  const anfang = text.indexOf(UEBERSCHRIFT)
  if (anfang < 0) return null
  const rest = text.slice(anfang + UEBERSCHRIFT.length)
  const ende = rest.search(/\n#{2,3} /)
  const abschnitt = ende < 0 ? rest : rest.slice(0, ende)
  // Alles ab dem ersten Listenpunkt; der erklaerende Vorspann wird ersetzt.
  const punkte = abschnitt.search(/^\d+\. /m)
  return punkte < 0 ? '' : abschnitt.slice(punkte).trimEnd()
}

const dateien = (await readdir(breitOrdner)).filter((n) => /^\d\d-.*\.md$/.test(n)).sort()
let geaendert = 0
let fehlend = []

for (const name of dateien) {
  const breitPfad = join(breitOrdner, name)
  const breitText = await readFile(breitPfad, 'utf8')
  const breit = liste(breitText)
  if (breit === null) continue

  let schmalText
  try {
    schmalText = await readFile(join(schmalOrdner, name), 'utf8')
  } catch {
    fehlend.push(name)
    continue
  }
  const schmal = liste(schmalText)
  if (schmal === null) { fehlend.push(name); continue }

  const neu = `${UEBERSCHRIFT}\n\n${VORSPANN}\n\n`
    + `#### Breites Fenster (1500 Pixel)\n\n${breit}\n\n`
    + `#### Schmales Fenster (800 Pixel)\n\n${schmal}\n`

  const anfang = breitText.indexOf(UEBERSCHRIFT)
  const rest = breitText.slice(anfang + UEBERSCHRIFT.length)
  const ende = rest.search(/\n#{2,3} /)
  const danach = ende < 0 ? '' : rest.slice(ende + 1)

  await writeFile(breitPfad, breitText.slice(0, anfang) + neu + '\n' + danach, 'utf8')
  geaendert++
  console.log(`  ${name} — ${breit.split('\n').length} breit, ${schmal.split('\n').length} schmal`)
}

console.log(`\n${geaendert} Beschreibungen tragen jetzt beide Reihenfolgen.`)
if (fehlend.length > 0) {
  console.log(`OHNE schmale Variante: ${fehlend.join(', ')}`)
  process.exit(1)
}
