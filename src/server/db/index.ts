/**
 * Datenzugriff ueber postgres.js.
 *
 * Bewusst duenn: getaggte Template-Literale statt eines ORM, wie im PHP-Stand
 * auch. Der Unterschied ist, dass die Ergebniszeilen hier typisiert sind.
 */
import postgres from 'postgres'

let _sql: postgres.Sql | null = null

export function db(): postgres.Sql {
  if (_sql) return _sql
  const c = useRuntimeConfig()
  // process.env hat Vorrang: Nitro uebernimmt zur Laufzeit nur NUXT_-praefigierte
  // Variablen in die runtimeConfig, alles andere wird beim Bauen eingebacken.
  // Ohne diesen Vorrang zeigt ein gebautes Abbild auf die Datenbank des Bauzeitpunkts.
  _sql = postgres({
    host: process.env.DB_HOST || c.dbHost,
    port: Number(process.env.DB_PORT || c.dbPort),
    database: process.env.DB_NAME || c.dbName,
    username: process.env.DB_USER || c.dbUser,
    password: process.env.DB_PASS || c.dbPass,
    max: 10,
    idle_timeout: 30,
    // Datum/Zeit als ISO-String, nicht als Date — sonst wandert die Zeitzone
    // durch JSON und veraendert Werte. Genau der Excel-Datumsfehler, eine Ebene tiefer.
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (v: string | Date) => (v instanceof Date ? v.toISOString() : v),
        parse: (v: string) => v
      }
    }
  })
  return _sql
}

/** Eine Zeile oder null. */
export async function row<T>(q: postgres.PendingQuery<postgres.Row[]>): Promise<T | null> {
  const r = await q
  return (r[0] as T) ?? null
}
