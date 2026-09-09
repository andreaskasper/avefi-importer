/*
 * Beim Start sagen, womit die Anwendung laeuft.
 *
 * Siehe server/lib/vorgabewerte.ts fuer den Anlass und die Abstufung. Der
 * Abbruch folgt dem Muster von plugins/schema.ts: Ein Server, der mit einem
 * bekannten Sitzungsgeheimnis hochkommt, sieht gesund aus und faellt erst dann
 * auf, wenn jemand ihn benutzt hat.
 */
import {
  auslieferung, merkeBefunde, protokollzeile, pruefeKonten, pruefeUmgebung
} from '../lib/vorgabewerte'
import { standaloneDb } from '../db/config'

export default defineNitroPlugin(async () => {
  const befunde = pruefeUmgebung()

  for (const b of befunde) {
    const marke = b.schwere === 'abbruch' ? '[vorgabewerte] ABBRUCH' : '[vorgabewerte] WARNUNG'
    console.error(`${marke}: ${protokollzeile(b)}`)
  }

  if (befunde.some((b) => b.schwere === 'abbruch')) {
    console.error('[vorgabewerte] Start abgebrochen. Im Entwicklungsbetrieb (NODE_ENV != production) '
      + 'bleibt es bei einer Warnung.')
    process.exit(1)
  }

  /*
   * Die Kontenpruefung erst danach und in eigener Verantwortung: Sie braucht
   * die Datenbank, und ein Start soll nicht daran scheitern, dass sie im
   * Moment nicht erreichbar ist. Das Schema-Plugin hat den Fall bereits
   * behandelt, wenn es soweit kommt.
   */
  const sql = standaloneDb()
  try {
    const konten = await pruefeKonten(sql)
    for (const b of konten) console.error(`[vorgabewerte] WARNUNG: ${protokollzeile(b)}`)
    befunde.push(...konten)
  } catch (e) {
    console.warn('[vorgabewerte] Konten nicht geprueft:', e instanceof Error ? e.message : e)
  } finally {
    await sql.end()
  }

  merkeBefunde(befunde)

  if (befunde.length === 0) console.log('[vorgabewerte] keine Vorgabewerte in Gebrauch.')
  else if (!auslieferung()) {
    console.error('[vorgabewerte] Entwicklungsbetrieb, deshalb nur eine Warnung. '
      + 'Vor dem ersten Produktivstart: docs/deployment.md, Abschnitt "Vor dem ersten Produktivstart".')
  }
})
