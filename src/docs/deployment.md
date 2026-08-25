# Betrieb und Auslieferung

Diese Datei beschreibt Installation, Initialisierung, Start, Bau, Tests und die
Umgebungsvariablen. Alle Angaben sind auf dem Testserver ausgefuehrt worden;
wo etwas nicht funktioniert, steht das dabei.

Alle Befehle laufen im Verzeichnis `src/`.

## Voraussetzungen

* Docker mit Compose-Plugin. Ohne Docker: Node ab 22.19.0 (`package.json`,
  Feld `engines`; die Images benutzen Node 24) und PostgreSQL 16.
* Ausgehende HTTPS-Verbindungen beim **Bauen** des efi-conv-Sidecars: das
  echte `efi-conv` wird per pip aus dem Git-Repository geholt und das
  AVefi-Schema einmalig ins Image geschrieben. Im laufenden Betrieb braucht der
  Dienst kein Netz mehr.
* Ausgehende HTTPS-Verbindungen zur Laufzeit nur, wenn `AUTHORITY_ENABLED`
  eingeschaltet wird. Standard ist aus.

## Container

`docker-compose.dev.yml` beschreibt fuenf Dienste.

| Dienst | Image | Aufgabe |
|---|---|---|
| `web` | aus `Dockerfile`, Stufe `base` | Nuxt/Nitro, Oberflaeche und `/api`. Hoert auf Port 3000. |
| `worker` | aus `Dockerfile`, Stufe `base` | Hintergrundprozess, arbeitet die Tabelle `worker_jobs` ab. |
| `efi-conv` | aus `efi-conv/Dockerfile` | Validierungsdienst mit dem echten `efi-conv`. Hoert auf Port 8000, nur im internen Netz. |
| `db` | `postgres:16` | Datenbank. Laedt beim ersten Start `db/schema.sql`. |
| `adminer` | `adminer` | Datenbankoberflaeche, nur auf `127.0.0.1:8081` gebunden. |

Die Datei ist bewusst nicht im Git (`.gitignore`), weil sie Deployment-Spezifika
enthaelt: die Traefik-Marken und den Hostnamen. Fuer eine eigene Installation
wird sie kopiert und angepasst.

### Warum der Worker ein eigener Container ist

Der Worker teilt mit der Oberflaeche nur die Datenbank und das Dateiverzeichnis,
sonst nichts. Das hat drei Gruende.

Erstens die Laufzeit: Eine Lieferung mit einigen hunderttausend Zeilen laeuft
Minuten. Liefe die Konvertierung im Webprozess, blockierte sie Anfragen oder
liefe in einen Zeitablauf des vorgelagerten Servers.

Zweitens der Speicher: Der Worker liest im Datenstrom und schreibt
`avefi.v1.json` mitwachsend. Sein Speicherbedarf haengt nicht an der
Dateigroesse, aber er ist ein anderer als der eines Webprozesses. Getrennte
Container lassen sich getrennt begrenzen und getrennt neu starten.

Drittens der Code-Stand: Der Worker beendet sich nach `WORKER_MAX_UPTIME`
(Vorgabe 600 Sekunden) von selbst, `restart: always` zieht ihn neu hoch. Ein
Dauerprozess haelt geladenen Code im Speicher; ohne Selbstbeendigung arbeitet er
mit altem Code weiter, waehrend die Oberflaeche schon neuen zeigt. Der Worker
benutzt deshalb `npm run worker` und nicht `tsx watch` — der
Ueberwachungsprozess von `watch` ueberlebt das Prozessende, der Container bliebe
stehen und `restart: always` griffe nicht.

Eine Warteschlange in der Datenbank statt Redis oder eines Nachrichtendienstes:
`SELECT … FOR UPDATE SKIP LOCKED` reicht fuer diese Last und spart einen
weiteren Dienst, der betrieben und gesichert werden muss.

### efi-conv als Sidecar

Der Vertrag verlangt Pruefung „mit `efi-conv check` oder unter direkter Nutzung
derselben Validierungslogik". Genau das passiert hier: `efi-conv/Dockerfile`
installiert das echte Paket per pip aus dem Git-Repository, `efi-conv/service.py`
laedt mit `get_schema_validator()` denselben Validator, den `efi-conv check`
benutzt. Nichts davon ist nachgebaut.

Zwei Bauargumente steuern, welcher Stand installiert wird:

```bash
docker compose -f docker-compose.dev.yml build \
  --build-arg EFI_CONV_REPO=github.com/AV-EFI/efi-conv.git \
  --build-arg EFI_CONV_REF=main \
  efi-conv
```

Damit laesst sich auf den Stand aus Leistungspaket A oder auf einen festen
Commit zeigen, sodass Konverter und Importer dieselbe Pruefung benutzen.

Das AVefi-Schema wird beim Bauen einmal geholt und im Image eingefroren
(`/root/.cache/efi_conv/`). Ohne das laedt efi-conv es zur Laufzeit vom
main-Branch, und keine Konvertierung waere reproduzierbar, weil sich das Schema
unter der laufenden Anwendung aendern kann. Welches Schema geladen wurde, sagt
`GET /health`; die Angabe wandert in den Pruefbericht jedes Imports.

Der Dienst hat zwei Endpunkte:

* `POST /check` sammelt alle Befunde. `efi-conv check` bricht beim ersten
  Schemafehler ab (`pass_checks` wirft); ein Importer muss alle Fehler auf
  einmal zeigen koennen, deshalb laeuft die Pruefung hier ueber `iter_errors`.
  Zusaetzlich zu den Schemafehlern pruefen dieselben satzuebergreifenden Regeln
  wie die Kommandozeile: Eindeutigkeit der Kennungen, aufloesbare Verweise,
  Knoten ohne zugehoeriges Exemplar. Der Kopfkommentar in `service.py` haelt
  diesen Unterschied fest.
* `POST /check-cli` fuehrt `efi-conv check` unveraendert auf einer temporaeren
  Datei aus und gibt Rueckgabewert, Standardausgabe und Fehlerausgabe zurueck.
  Der Endpunkt ist fuer den Abnahmenachweis da: Er belegt, dass die
  Kommandozeile zum selben Ergebnis kommt.

## Installation und Start

```bash
git clone <repository>
cd avefi-importer/src

cp .env.example .env          # Werte anpassen, mindestens DB_PASS und SESSION_SECRET
cp docker-compose.dev.yml docker-compose.local.yml   # falls eigene Marken noetig

docker compose -f docker-compose.dev.yml up -d --build
```

Der erste Aufbau dauert einige Minuten, im Wesentlichen wegen des
efi-conv-Images. Danach:

```bash
docker compose -f docker-compose.dev.yml ps
```

Alle fuenf Dienste stehen auf `Up`, `db` und `efi-conv` zusaetzlich auf
`healthy`. Die Oberflaeche liegt hinter dem vorgelagerten Server auf Port 3000
des `web`-Containers; Adminer auf `http://127.0.0.1:8081`.

### Initialisierung

`db/schema.sql` wird von PostgreSQL beim **ersten** Start automatisch
ausgefuehrt (`docker-entrypoint-initdb.d`) und legt zehn Tabellen sowie eine
Start-Institution an. Nachgereichte Spalten stehen als
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` in derselben Datei, sie ist also auch
auf einer bestehenden Datenbank wiederholbar:

```bash
docker compose -f docker-compose.dev.yml exec -T db psql -U avefi -d avefi < db/schema.sql
```

**Ein Anmeldekonto legt das Schema nicht an**, und ein Skript dafuer gibt es
derzeit nicht (siehe „Offene Punkte" unten). Bis dahin wird das erste Konto von
Hand angelegt. Der Hash muss argon2id mit den Vorgaben aus
`server/lib/users.ts` sein:

```bash
# 1. Hash erzeugen (Passwort ersetzen)
docker compose -f docker-compose.dev.yml exec -T web \
  node -e "import('@node-rs/argon2').then(a=>a.hash(process.argv[1],{memoryCost:65536,timeCost:4,parallelism:1}).then(h=>console.log(h)))" \
  'HierEinEigenesPasswort'

# 2. Konto anlegen (Adresse und Hash einsetzen)
docker compose -f docker-compose.dev.yml exec -T db psql -U avefi -d avefi -c \
  "INSERT INTO users (institution_id,email,password_hash,name,is_admin)
   VALUES (1,'admin@example.org','<Hash aus Schritt 1>','Administration',true)"
```

Danach ist die Anmeldung moeglich. Weitere Konten legt die Nutzerverwaltung in
der Oberflaeche an; sie erzeugt Einmalpasswoerter, die genau einmal in der
Antwort erscheinen.

Der Ablauf ist auf einer frisch aufgesetzten Datenbank durchgespielt worden:
Schema geladen, Konto angelegt, `POST /api/auth/login` antwortet mit 200 und
dem Konto, ein falsches Passwort mit 401.

### Tests

Die Tests brauchen keine Datenbank und keinen laufenden Dienst:

```bash
docker run --rm -v "$PWD":/app -w /app node:24-alpine npx vitest run
```

Stand der Pruefung: **332 Tests in 24 Dateien, alle erfolgreich**, Laufzeit
unter zwei Sekunden. Ohne Docker genuegt `npm test`.

Abgedeckt sind Konverterkette und Typpruefung, Mappingprofile samt Aus- und
Wiedereinlesen, Kopfzeilen-Aufloesung, Vorschau, Zielkatalog, Schemamodell,
Vollstaendigkeitsberechnung, Excel-Datumsbehandlung, Trennzeichenerkennung,
Parse-Diagnose, Warteschlange und die Normdatenanbindung mit ihrem
Zwischenspeicher. Nicht abgedeckt sind die Vue-Komponenten; die Oberflaeche wird
von Hand geprueft, siehe `frontend-pruefen.md`.

## Auslieferungsbau

Das `Dockerfile` hat drei Stufen. `base` ist der Entwicklungsstand mit
gemountetem Code, `build` fuehrt `npm run build` aus, `production` uebernimmt nur
das erzeugte `.output` in ein schlankes Image.

```bash
docker build --target production -t avefi-importer:prod .
```

**Geprueft:** Der Bau laeuft durch (21 Schritte, keine Fehler), das Image
startet mit `node .output/server/index.mjs`, meldet `Listening on http://[::]:3000`
und beantwortet `/login` mit HTTP 200 samt der erwarteten Kopfzeile
`cache-control: no-store, private, max-age=0, must-revalidate`.

Start des ausgelieferten Images:

```bash
docker run -d --name avefi-web \
  -e NUXT_DB_HOST=db -e NUXT_DB_PORT=5432 \
  -e NUXT_DB_NAME=avefi -e NUXT_DB_USER=avefi -e NUXT_DB_PASS=... \
  -e NUXT_SESSION_SECRET=... \
  -e FILES_PATH=/mnt/files -e EFI_CONV_URL=http://efi-conv:8000 \
  -v avefi_files:/mnt/files \
  avefi-importer:prod
```

Der Worker laeuft im Auslieferungsbetrieb weiter aus der `base`-Stufe
(`npm run worker`); `.output` enthaelt nur den Webteil.

Der Testserver laeuft absichtlich im Entwicklungsmodus (`npm run dev`, Code als
Volume gemountet), damit Aenderungen ohne neuen Aufbau wirken. Der
Auslieferungsweg ist dadurch nicht ungeprueft — er ist als eigene Stufe im
Dockerfile enthalten und, wie oben beschrieben, ausgefuehrt worden.

## Umgebungsvariablen

### Zwei Schreibweisen

Im Entwicklungsbetrieb (`npm run dev`) wertet Nuxt die `runtimeConfig` in
`nuxt.config.ts` beim Start aus; die unpraefigierten Namen wirken.

Im Auslieferungsbetrieb ist das anders und **das ist die haeufigste Fehlerquelle
beim Aufsetzen**: Nitro uebernimmt zur Laufzeit nur Variablen mit dem Praefix
`NUXT_` in die `runtimeConfig`. Die unpraefigierten Namen werden beim Bauen
gelesen und als Vorgabewert eingebacken. Wer im Auslieferungsimage nur
`DB_HOST` setzt, landet auf dem eingebackenen Wert `db`.

Das ist nachgestellt worden: dasselbe Image, dieselbe Datenbank — mit `DB_HOST`
schlaegt die Anmeldung mit 401 fehl (falsche Datenbank), mit `NUXT_DB_HOST`
antwortet sie mit 200.

Betroffen sind nur die Werte, die tatsaechlich aus der `runtimeConfig` gelesen
werden: `DB_*` und `SESSION_SECRET`. Alles andere liest der Code direkt aus
`process.env` und funktioniert in beiden Betriebsarten mit dem einfachen Namen.

### Verzeichnis

| Variable | Pflicht | Vorgabe | Zweck |
|---|---|---|---|
| `DB_HOST` / `NUXT_DB_HOST` | ja | `db` | Rechnername der Datenbank. Im Auslieferungsbetrieb `NUXT_`-Form noetig. |
| `DB_PORT` / `NUXT_DB_PORT` | nein | `5432` | Port der Datenbank. |
| `DB_NAME` / `NUXT_DB_NAME` | ja | `avefi` | Name der Datenbank. |
| `DB_USER` / `NUXT_DB_USER` | ja | `avefi` | Benutzer der Datenbank. |
| `DB_PASS` / `NUXT_DB_PASS` | ja | `avefi` | Passwort. Die Vorgabe ist ein Entwicklungswert und gehoert ersetzt. |
| `SESSION_SECRET` / `NUXT_SESSION_SECRET` | ja | `entwicklung-nur-lokal-aendern` | Schluessel der verschluesselten Sitzungscookies. Mindestens 32 Zeichen; kuerzere Werte werden aufgefuellt, ohne dadurch sicherer zu werden. Wechselt der Wert, sind alle Sitzungen ungueltig. |
| `FILES_PATH` | nein | `/mnt/files` | Ablage der Uploads und Ergebnisdateien. Muss beschreibbar sein. |
| `EFI_CONV_URL` | nein | `http://efi-conv:8000` | Adresse des Validierungsdienstes. Ist er nicht erreichbar, wird die Datei erzeugt, der Bericht vermerkt aber ausdruecklich, dass nicht geprueft wurde. |
| `WORKER_MAX_UPTIME` | nein | `600` | Sekunden bis zur Selbstbeendigung des Workers. Nur im `worker`-Container sinnvoll. |
| `AUTHORITY_ENABLED` | nein | aus | Normdatenanreicherung. Wahr bei `1`, `true`, `ja`, `on`. Vertraglich nicht geschuldet. |
| `AUTHORITY_LIMIT` | nein | `500` | Obergrenze der Nachschlagevorgaenge je Konvertierung. Unbrauchbare Angaben fallen auf 500 zurueck. |
| `EFI_CONV_REPO` | nein (Bauzeit) | `github.com/AV-EFI/efi-conv.git` | Herkunft von efi-conv beim Bauen des Sidecars. |
| `EFI_CONV_REF` | nein (Bauzeit) | `main` | Zweig oder Commit von efi-conv. Fuer reproduzierbare Ergebnisse einen Commit eintragen. |
| `APP_DOMAIN` | nein | `avefiimporter.goo1.de` | Nur fuer die Traefik-Regel in `docker-compose.dev.yml`. Die Anwendung selbst kennt keine feste Domain. |

Zwei weitere Variablen sind in `nuxt.config.ts` vorgesehen, werden aber derzeit
von keiner Stelle im Code gelesen. Sie zu setzen hat keine Wirkung:

| Variable | Stand |
|---|---|
| `DEMO_PASSWORD` | Vorbereitet fuer einen einfachen Zugriffsschutz ohne Nutzerkonto. `SessionData.demoUnlocked` existiert, wird aber nirgends gesetzt oder ausgewertet. Der Zugang laeuft ueber die Nutzerverwaltung. |
| `NUXT_PUBLIC_API_BASE` | Vorbereitet fuer eine konfigurierbare API-Basis. Die Oberflaeche ruft `/api/...` mit festen Pfaden auf. |

Ebenfalls ohne Wirkung im Code: `APP_HOST` aus `docker-compose.dev.yml` und
`NODE_ENV` ausserhalb dessen, was Nuxt und Nitro selbst daraus machen.

## Zwischenspeicherung

Nitro setzt fuer `/**` die Kopfzeilen `cache-control: no-store, private,
max-age=0, must-revalidate`, dazu `cdn-cache-control`,
`cloudflare-cdn-cache-control` und `vary: cookie`.

Der Grund ist ein aufgetretener Fall, kein Vorsichtsprinzip: Ein vorgelagerter
Zwischenspeicher (Cloudflare) hat eine angemeldete Importliste abgelegt und an
Aufrufer ohne Sitzung weitergegeben, nachweisbar an `cf-cache-status: HIT` auf
der Importliste ohne Sitzungscookie. Jede Seite dieser Anwendung zeigt Daten
einer angemeldeten Institution; keine davon darf zwischengespeichert werden.

Ausgenommen sind Dateien ohne Personenbezug: `/_nuxt/**` (ein Jahr, `immutable`,
die Namen tragen einen Hash), `favicon.ico`, `favicon.svg`, `av-efi-logo.svg`
und `robots.txt` (je ein Tag).

Wer einen anderen vorgelagerten Server einsetzt, prueft das nach:

```bash
curl -sI https://<host>/ | grep -i cache
```

## Sicherung

Zu sichern sind zwei Dinge:

* die Datenbank (`pg_dump`) — Importe, Datensaetze, Mappingprofile samt
  Fassungsverlauf, Konten;
* das Verzeichnis aus `FILES_PATH` — Originaldateien und erzeugte
  `avefi.v1.json`.

Eines ohne das andere nuetzt wenig: Die Datenbank verweist mit
`imports.storage_path` auf Dateien, und ein Import ohne seine Originaldatei
laesst sich nicht erneut konvertieren.

## Offene Punkte

* **Kein Skript fuer Initialisierung und Migration.** `package.json` nennt
  `npm run migrate` (`server/db/migrate.ts`) und `npm run seed`
  (`server/db/seed.ts`); beide Dateien gibt es nicht, die Befehle brechen ab.
  Solange das so ist, gilt der oben beschriebene Weg von Hand. Er ist
  ausgefuehrt und funktioniert, aber ein Skript waere die bessere Antwort.
* **Der Kopfkommentar in `db/schema.sql`** verweist noch auf den Seed-Bot der
  PHP-Fassung (`php app/bot.php -t seed`). Der Hinweis stimmt nicht mehr.
* **Die laufende Testdatenbank enthaelt eine Tabelle `jobs`**, die in
  `db/schema.sql` nicht vorkommt. Sie stammt aus der PHP-Fassung, wird von
  dieser Anwendung nicht benutzt und fehlt einer frisch aufgesetzten Datenbank
  zu Recht.
