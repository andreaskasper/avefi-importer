/*
 * Laeuft die Anwendung noch mit Werten aus der Beispielkonfiguration?
 *
 * Der Anlass, am 09.09.2026: Auf der oeffentlich erreichbaren Testinstanz stand
 * das Passwort des Administratorkontos auf `changeme`, `DB_PASS` auf `avefi`
 * und `SESSION_SECRET` auf dem Vorgabewert. Alle drei Punkte standen zu diesem
 * Zeitpunkt bereits richtig in der Anleitung — `docs/deployment.md` sagt in der
 * Pflicht-Spalte "Die Vorgabe ist ein Entwicklungswert und gehoert ersetzt".
 *
 * Eine Anleitung, die schon stimmt und trotzdem nicht greift, wird nicht
 * dadurch besser, dass man sie ergaenzt. Die Anwendung weiss zur Laufzeit
 * selbst, womit sie laeuft, und ist die einzige Stelle, an der sich das nicht
 * uebersehen laesst.
 *
 * Abgestuft, nicht pauschal:
 *
 *   SESSION_SECRET  Ein bekannter Wert heisst, dass jeder fremde
 *                   Sitzungscookies erzeugen kann. Im Auslieferungsbetrieb
 *                   bricht der Start ab, sonst bliebe die Anmeldung eine
 *                   Kulisse.
 *   DB_PASS         Warnung. Die Datenbank haengt ueblicherweise im internen
 *                   Netz des Verbunds und ist von aussen nicht erreichbar.
 *   Konten          Warnung. Ein Konto mit bekanntem Passwort ist eine offene
 *                   Tuer, aber die Anwendung darf sich deswegen nicht selbst
 *                   aussperren.
 */
import type { Sql } from 'postgres'
import { verifyPassword } from './users'

/**
 * Werte, die in Beispielkonfiguration, Compose-Datei und Anleitung stehen.
 *
 * Bewusst als Liste und nicht als ein Wert je Variable: `SESSION_SECRET` hatte
 * ueber die Zeit drei verschiedene Platzhalter (`.env.example`,
 * `docker-compose.dev.yml`, `nuxt.config.ts`), und wer nach dem einen suchte,
 * fand den anderen nicht. Sie stehen hier alle.
 */
export const VORGABE_SESSION_SECRET = [
  'entwicklung-nur-lokal-aendern',
  'entwicklung-bitte-setzen',
  'hier-einen-eigenen-zufallswert-von-mindestens-32-zeichen-eintragen'
]

export const VORGABE_DB_PASS = ['avefi', 'bitte-eigenes-passwort-setzen', 'postgres']

/**
 * Passwoerter, die in der Dokumentation dieses Projekts als Beispiel auftauchen
 * oder allgemein zu den ersten Versuchen gehoeren.
 *
 * Kurz halten. Die Liste wird beim Start je aktivem Administratorkonto
 * durchgerechnet, und argon2id ist absichtlich langsam.
 */
export const VORGABE_PASSWOERTER = [
  'changeme', 'change-me', 'geheim', 'passwort', 'password', 'admin', 'avefi', 'test1234'
]

export type Schwere = 'abbruch' | 'warnung'

export interface Befund {
  /** Maschinenlesbar, damit die Oberflaeche eigene Saetze bilden kann. */
  code: 'session_secret' | 'db_pass' | 'konto_passwort'
  schwere: Schwere
  /** Bei `konto_passwort`: die betroffene Adresse. */
  betrifft?: string
}

/** Ob wir im Auslieferungsbetrieb laufen. */
export function auslieferung(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Was sich ohne Datenbank pruefen laesst.
 *
 * Gelesen wird aus `process.env`, mit denselben Vorgaben wie in
 * `nuxt.config.ts`. Der ungesetzte Fall zaehlt als Vorgabewert, denn genau dann
 * greift die Vorgabe.
 */
export function pruefeUmgebung(): Befund[] {
  const befunde: Befund[] = []

  const secret = process.env.SESSION_SECRET ?? process.env.NUXT_SESSION_SECRET ?? ''
  if (secret === '' || VORGABE_SESSION_SECRET.includes(secret)) {
    befunde.push({ code: 'session_secret', schwere: auslieferung() ? 'abbruch' : 'warnung' })
  }

  const dbPass = process.env.DB_PASS ?? process.env.NUXT_DB_PASS ?? ''
  if (dbPass === '' || VORGABE_DB_PASS.includes(dbPass)) {
    befunde.push({ code: 'db_pass', schwere: 'warnung' })
  }

  return befunde
}

/**
 * Aktive Administratorkonten gegen die bekannten Passwoerter halten.
 *
 * Nur Administratoren, und nur aktive: Ein gesperrtes Konto kann sich nicht
 * anmelden, und ein einfaches Konto mit schwachem Passwort ist ein Fall fuer die
 * Nutzerverwaltung, nicht fuer den Start.
 */
export async function pruefeKonten(sql: Sql): Promise<Befund[]> {
  const konten = await sql<{ email: string; password_hash: string | null }[]>`
    SELECT email, password_hash FROM users WHERE is_admin = true AND active = true`

  const befunde: Befund[] = []
  for (const konto of konten) {
    for (const kandidat of VORGABE_PASSWOERTER) {
      if (await verifyPassword(kandidat, konto.password_hash)) {
        befunde.push({ code: 'konto_passwort', schwere: 'warnung', betrifft: konto.email })
        break
      }
    }
  }
  return befunde
}

/** Ein Satz je Befund, fuer das Protokoll. Die Oberflaeche uebersetzt selbst. */
export function protokollzeile(b: Befund): string {
  if (b.code === 'session_secret') {
    return 'SESSION_SECRET steht auf einem Wert aus der Beispielkonfiguration. '
      + 'Wer ihn kennt, kann Sitzungscookies erzeugen und sich als beliebiges Konto ausgeben. '
      + 'Eigenen Wert erzeugen: openssl rand -base64 48'
  }
  if (b.code === 'db_pass') {
    return 'DB_PASS steht auf einem Wert aus der Beispielkonfiguration.'
  }
  return `Das Konto ${b.betrifft ?? ''} laesst sich mit einem Passwort aus der Dokumentation anmelden.`
}

/*
 * Das Ergebnis des Startlaufs, damit die Oberflaeche es zeigen kann.
 *
 * Gehalten statt bei jeder Anfrage neu gerechnet: Die Kontenpruefung rechnet
 * argon2id je Konto und Kandidat durch, das ist absichtlich langsam und hat in
 * einer Anfrage nichts zu suchen. Wer einen Wert aendert, startet die Anwendung
 * ohnehin neu — bei `DB_PASS` und `SESSION_SECRET` bleibt gar nichts anderes
 * uebrig.
 */
let gemerkt: Befund[] = []

export function merkeBefunde(befunde: Befund[]): void {
  gemerkt = befunde
}

export function gemerkteBefunde(): Befund[] {
  return gemerkt
}
