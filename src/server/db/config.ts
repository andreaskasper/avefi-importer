/** Verbindungsdaten fuer Prozesse ausserhalb von Nitro (Worker, Migration, Seed). */
import postgres from 'postgres'

export function standaloneDb(): postgres.Sql {
  return postgres({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'avefi',
    username: process.env.DB_USER || 'avefi',
    password: process.env.DB_PASS || 'avefi',
    max: 4,
    idle_timeout: 30,
    // Das Schema ist durchgaengig mit IF NOT EXISTS geschrieben. PostgreSQL
    // quittiert jedes uebersprungene Objekt mit einem NOTICE — beim Start
    // sind das ueber achtzig Zeilen, die nichts melden und alles verdecken,
    // was danach kommt.
    onnotice: () => {}
  })
}
