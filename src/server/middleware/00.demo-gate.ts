/**
 * Einfacher Zugriffsschutz fuer Entwicklung und Vorfuehrung.
 *
 * Der Vertrag verlangt in Paragraf 3 ausdruecklich keine Benutzerverwaltung,
 * sondern „eine einfache konfigurierbare Demo-Authentifizierung". Ist
 * DEMO_PASSWORD gesetzt, liegt sie als Basic-Authentifizierung vor der
 * gesamten Anwendung — unabhaengig von der Anmeldung mit Konto. Ist die
 * Variable leer, greift nichts und es bleibt bei der Kontoanmeldung.
 */
export default defineEventHandler((event) => {
  const expected = process.env.DEMO_PASSWORD || useRuntimeConfig().demoPassword
  if (!expected) return

  const path = getRequestURL(event).pathname
  // Statische Mitbringsel und die Bereitschaftsanzeige bleiben frei.
  if (path.startsWith('/_nuxt/') || path.startsWith('/__nuxt') || path === '/favicon.ico') return

  const header = getRequestHeader(event, 'authorization') || ''
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const given = decoded.slice(decoded.indexOf(':') + 1)
    // Vergleich mit fester Laufzeit, damit sich das Passwort nicht erraten laesst.
    if (given.length === expected.length) {
      let diff = 0
      for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
      if (diff === 0) return
    }
  }

  setResponseHeader(event, 'www-authenticate', 'Basic realm="AVefi Importer", charset="UTF-8"')
  throw createError({ statusCode: 401, statusMessage: 'Zugriffsschutz aktiv.' })
})
