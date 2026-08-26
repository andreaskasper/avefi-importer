# Komponenten- und API-Struktur

## Warum die Trennung

Der Vertrag (Anlage „Integration und Kompatibilitaet") verlangt, dass
Oberflaeche, Mappinglogik und Datenzugriff getrennt liegen, damit sich Teile
einzeln ersetzen lassen. Die Verzeichnisse setzen das um:

```
app/components   reine Darstellung, keine Mappinglogik
server/lib       Mappinglogik, ohne Kenntnis von HTTP oder UI
server/api       Endpunkte, duenn, nur Uebersetzung HTTP <-> lib
shared/types     Typen, die beide Seiten benutzen
```

Die Regel laesst sich nachpruefen: In `server/lib/mapping/` kommt weder `h3`
noch `postgres` vor, in `app/components/` keine Datenbankabfrage. Alles, was
`server/lib/mapping/` an Nachschlagediensten braucht, wird von aussen
hereingereicht (`TransformContext`, `MappingServices`) — deshalb laeuft die
Mappinglogik ohne Netz und ohne Datenbank und ist mit einfachen Tests pruefbar.

Ein zweiter Punkt gehoert dazu: Vorschau und Konvertierung benutzen **denselben**
Code. Eine zweite Umsetzung im Browser waere schneller, wuerde aber bedeuten,
dass die Vorschau etwas anderes zeigt als das Ergebnis. Deshalb rechnet auch die
Vorschau auf dem Server (`server/api/mappings/_run.ts`).

## Verzeichnisse

```
src/
  nuxt.config.ts        runtimeConfig, i18n, Nitro-Regeln (Zwischenspeicherung)
  Dockerfile            base / build / production
  docker-compose.dev.yml
  vitest.config.ts
  db/schema.sql         PostgreSQL-Schema, wird beim ersten Start geladen
  efi-conv/             Sidecar: Dockerfile + service.py
  i18n/locales/{de,en}/ je sechs Dateien (common, auth, imports, mapping, records, admin)
  public/               Symbole, robots.txt, Schemakopien unter public/schema/

  app/                  Oberflaeche (Vue 3, TypeScript)
    app.vue             Rahmen, Dokumentsprache folgt der Oberflaeche
    error.vue
    layouts/            default (angemeldet), auth (Anmeldung)
    middleware/auth.global.ts   ohne Anmeldung nur /login
    composables/useAuth.ts
    pages/              siehe „Seiten"
    components/
      imports/          Importliste, Upload, Pipeline, Statusabzeichen, Befundlisten
      mapping/          Editor, Kette, Verzweigung, Zielauswahl, Vokabular, Ergebnisbaum
      records/          Datensatztabelle, Feldzeilen, Enum-Auswahl, Normdatenfelder
      admin/            Einmalpasswort, Stichprobenvorschau
    assets/css/app.css

  server/
    api/                Endpunkte, nach Bereichen (siehe unten)
    lib/
      mapping/          Kern: transform, targets, builder, runner, profile,
                        header, preview, suggest, completeness, schema-model
      converters/       Formaterkennung und Konverter (csv, spreadsheet, xml,
                        marcXml, ead, genericJson, avefiJson, fingerprint …)
      authority/        Normdaten (GND, Wikidata, VIAF) mit Zwischenspeicher;
                        pipeline.ts ist der EINE Weg, den Vorschau und
                        Konvertierung zum Aufloesen nehmen
      imports.ts records.ts users.ts storage.ts schema.ts
    worker/
      main.ts           Daemon
      queue.ts          SELECT … FOR UPDATE SKIP LOCKED
      validate.ts       Bruecke zu efi-conv
      jobs/             download, detect, convert
    db/                 config.ts (Standalone), index.ts (Nitro)
    utils/session.ts

  shared/types/domain.ts   einzige Wahrheit fuer Backend und Oberflaeche
  tests/                   26 Dateien, 348 Tests
```

`shared/types/domain.ts` liegt bewusst in `shared/`, damit ein Feldname nicht an
zwei Stellen gepflegt wird. In der PHP-Fassung ist genau daran der Profil-Export
ohne Stichprobe gescheitert.

Aus demselben Grund gibt es `server/lib/authority/pipeline.ts` und
`server/lib/schema.ts`: Vorschau und Konvertierung holen sich ihre
Nachschlagedienste und ihr Schemamodell an derselben Stelle. Vorher tat das die
Vorschau auf eigene Faust und der Konvertierungsweg gar nicht — der Editor
zeigte normalisierte Laendernamen und Normdaten-IDs, die erzeugte Datei
enthielt weder das eine noch das andere.

## Ablauf eines Imports

```
Upload / URL ──▶ queued ──▶ detect ──┬─▶ Kopfzeile bekannt ──▶ convert ──▶ converted
                                     ├─▶ mehrere Blaetter ───▶ awaiting_sheet_choice
                                     └─▶ Kopfzeile unbekannt ─▶ awaiting_format_review
```

| Schritt | Was passiert | Status |
|---|---|---|
| Upload | Datei landet unveraendert in `<FILES_PATH>/<uuid>/org/`, Auftrag `detect` in die Warteschlange | `uploading` → `queued` |
| Download | Bei Upload ueber eine Adresse holt der Worker die Datei | `queued` |
| Detect | Basisformat, Fingerabdruck und Kopfzeilen-Hash; passendes Mappingprofil gesucht | `converting`, `awaiting_sheet_choice` oder `awaiting_format_review` |
| Blattwahl | Jedes gewaehlte Blatt einer Arbeitsmappe wird als CSV nach `work/` herausgeloest und ein eigener Import | `converting` |
| Convert | Datensaetze erzeugen, `avefi.v1.json` schreiben, gegen efi-conv pruefen, Bericht ablegen | `converted` oder `error` |

Ab `work/` unterscheidet sich ein Excel-Blatt nicht mehr von einer
hochgeladenen CSV. Die hochgeladene Datei bleibt unangetastet in `org/`, sonst
liesse sich hinterher nicht mehr belegen, was geliefert wurde.

### Ablage

```
<FILES_PATH>/<import-uuid>/org/<Originaldatei>    unveraendert
<FILES_PATH>/<import-uuid>/work/<Blatt>.csv       abgeleitet
<FILES_PATH>/<import-uuid>/avefi.v1.json          Ergebnis
```

Jeder Schreibvorgang wird geprueft. In der PHP-Fassung liefen `copy()` und
`file_put_contents()` mit vorangestelltem `@`, und der Rueckgabewert wurde nicht
ausgewertet; im Dateibestand steht deshalb ein Import mit Status „konvertiert"
und 2738 Datensaetzen, dessen `avefi.v1.json` null Byte gross ist. Eine leere
Lieferdatei bei gemeldetem Erfolg ist der schlimmste denkbare Ausgang, deshalb
wirft hier jeder fehlgeschlagene Schreibvorgang.

Grosse Lieferungen laufen im Datenstrom: `AvefiWriter` schreibt mitwachsend,
die Pruefung geht in Buendeln von 500 Datensaetzen an efi-conv.

## Datenbank

Zehn Tabellen (`db/schema.sql`):

| Tabelle | Inhalt |
|---|---|
| `institutions` | Haeuser; jeder Import und jedes Profil gehoert einem. |
| `users` | Konten, Passwort als argon2id. bcrypt wird nur noch gelesen. |
| `imports` | Ein Upload mit Status, Kopfzeilen-Hash, gewaehltem Blatt, benutztem Profil samt Fassung und Pruefbericht. |
| `records` | Erzeugte Datensaetze mit `data_json`, Vollstaendigkeit, Quellzeile und `edited_at`. |
| `format_profiles` | Im Code vorhandene Konverter. |
| `format_reviews` | Warteschlange fuer unbekannte Kopfzeilen. |
| `mapping_profiles` | Zuordnungen je Kopfzeile, mit Stichprobe. |
| `mapping_profile_versions` | Fassungsverlauf der Profile. |
| `authority_cache` | Normdaten-Zwischenspeicher. |
| `worker_jobs` | Warteschlange des Hintergrundprozesses. |

Der Zugriff laeuft ueber `postgres.js` mit getaggten Template-Literalen, kein
ORM. Datums- und Zeitwerte werden als ISO-Zeichenkette gelesen statt als
`Date`-Objekt, weil sonst die Zeitzone durch JSON wandert und Werte veraendert —
derselbe Fehler wie bei Excel-Datumsangaben, eine Ebene tiefer.

## Seiten

| Pfad | Inhalt |
|---|---|
| `/login` | Anmeldung. Einzige Seite ohne Anmeldung. |
| `/` | Importliste mit Upload und laufender Aktualisierung. |
| `/imports/:id` | Detailseite eines Imports. |
| `/imports/:id/sheets` | Blattwahl einer Arbeitsmappe. |
| `/imports/:id/mapping` | Mapping-Editor am Import. |
| `/imports/:id/records` | Datensaetze des Imports. |
| `/imports/:id/records/:recordId` | Einzelsatzbearbeitung. |
| `/imports/:id/report` | Pruefbericht. |
| `/mappings`, `/mappings/new`, `/mappings/:id`, `/mappings/:id/edit` | Profile ohne Import. |
| `/reviews`, `/reviews/:id` | Formatpruefung. |
| `/users`, `/users/:id` | Nutzerverwaltung. |
| `/profile` | Eigenes Konto. |

## API

Alle Endpunkte liegen unter `/api`. Ohne gueltige Sitzung antworten sie mit 401,
Endpunkte fuer Administratorinnen mit 403. Zugriff ist auf die eigene
Institution beschraenkt; ein Import einer fremden Institution ist nicht
erreichbar.

### Anmeldung

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/auth/login` | Anmelden. Bei unbekannter Adresse wird trotzdem ein Hash geprueft, damit die Antwortzeit nichts verraet. |
| POST | `/api/auth/logout` | Abmelden. |
| GET | `/api/auth/me` | Aktuelles Konto. |

### Importe

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/imports` | Importliste der eigenen Institution. Ohne Pruefbericht, der kann sehr gross werden. |
| GET | `/api/imports/status` | Kurzstand aller Importe, fuer die selbstaktualisierende Liste. |
| POST | `/api/imports/upload?name=<Dateiname>` | Datei hochladen. Der Rumpf ist die Datei selbst, kein Multipart-Umschlag. |
| POST | `/api/imports/url` | Datei von einer Adresse holen lassen; der Abruf selbst laeuft im Hintergrund. |
| GET | `/api/imports/:id` | Alles fuer die Detailseite. |
| DELETE | `/api/imports/:id` | Import samt Dateien und Datensaetzen entfernen. |
| GET | `/api/imports/:id/original` | Die hochgeladene Datei, unveraendert. |
| GET | `/api/imports/:id/avefi.json` | Die erzeugte AVefi-Datei. |
| GET | `/api/imports/:id/report` | Pruefbericht mit allen Beanstandungen. |
| POST | `/api/imports/:id/reconvert` | Erneut aus der Originaldatei erzeugen. |
| GET | `/api/imports/:id/sheets` | Tabellenblaetter einer Arbeitsmappe. |
| POST | `/api/imports/:id/sheets` | Gewaehlte Blaetter uebernehmen; je Blatt entsteht ein eigener Import. |

### Datensaetze eines Imports

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/imports/:id/records` | Datensaetze, serverseitig gesucht und geblaettert (`q`, `limit` bis 200, `offset`). |
| GET | `/api/imports/:id/records/:recordId` | Ein Datensatz zum Bearbeiten. |
| PUT | `/api/imports/:id/records/:recordId` | Bearbeiteten Datensatz speichern; setzt `edited_at`. |

### Mapping am Import

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/imports/:id/mapping` | Startnutzlast des Editors. |
| POST | `/api/imports/:id/mapping/preview` | Vorschau des Entwurfs auf echten Zeilen. |
| POST | `/api/imports/:id/mapping/schema` | Entwurf gegen das AVefi-Schema pruefen (efi-conv). |
| POST | `/api/imports/:id/mapping/candidates` | Normdaten-Kandidaten zu einem Wert. |
| POST | `/api/imports/:id/mapping/save` | Profil speichern, auf Wunsch gleich konvertieren. |
| POST | `/api/imports/:id/mapping/adopt` | Fremdes Profil uebernehmen — als Kopie, nicht als Verweis. |

### Mappingprofile

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/mappings` | Alle Profile, eigene zuerst. |
| POST | `/api/mappings` | Exportiertes Profil einlesen. |
| POST | `/api/mappings/new?name=<Dateiname>` | Profil aus einer Beispieldatei anlegen, ohne Import. |
| GET | `/api/mappings/:id` | Ein Profil mit Fassungsverlauf. |
| PATCH | `/api/mappings/:id` | Umbenennen. Erzeugt keine neue Fassung. |
| DELETE | `/api/mappings/:id` | Loeschen. Bereits konvertierte Importe bleiben unveraendert. |
| GET | `/api/mappings/:id/editor` | Startnutzlast des Editors, gerechnet auf der Stichprobe. |
| GET | `/api/mappings/:id/export` | Profil als JSON, Stichprobe inbegriffen. |
| POST | `/api/mappings/:id/preview` | Vorschau auf der Stichprobe. |
| POST | `/api/mappings/:id/schema` | Entwurf gegen das AVefi-Schema pruefen. |
| POST | `/api/mappings/:id/candidates` | Normdaten-Kandidaten zu einem Wert. |
| POST | `/api/mappings/:id/sample?name=<Dateiname>` | Beispieldaten nachreichen. |
| POST | `/api/mappings/:id/save` | Entwurf als neue Fassung speichern. |
| POST | `/api/mappings/:id/restore` | Fruehere Fassung wieder aktivieren. |

### Datensatz-Werkzeuge

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/records/config` | Zielkatalog und Schemawissen fuer den Editor. |
| POST | `/api/records/validate` | Live-Pruefung eines Datensatzes bei efi-conv. |
| GET | `/api/records/authority/search` | Normdaten-Kandidaten (`kind`, `q`, `sources`). Liefert nur Vorschlaege. |
| GET | `/api/records/authority/detail` | Einzelheiten zu einem Treffer, damit sich eine Zuordnung vor der Bestaetigung pruefen laesst. |

### Formatpruefung

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/reviews` | Warteschlange. Eine Aufgabe je Institution und Kopfzeile, nicht je Datei. |
| GET | `/api/reviews/count` | Zahl der offenen Aufgaben fuer das Abzeichen in der Kopfzeile. |
| GET | `/api/reviews/:id` | Eine Aufgabe mit allem, was fuer die Entscheidung noetig ist. |
| POST | `/api/reviews/:id/assign` | Konverter zuordnen. Die Entscheidung gilt der Kopfzeile, nicht der Datei. |
| POST | `/api/reviews/:id/reject` | Format ablehnen. Der Import wird auf `error` gesetzt, nicht geloescht. |

### Konto und Nutzerverwaltung

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/profile` | Eigenes Konto. |
| PATCH | `/api/profile` | Eigenen Anzeigenamen aendern. Die Adresse bleibt, sie ist die Anmeldung. |
| POST | `/api/profile/password` | Eigenes Passwort aendern; das alte wird verlangt. |
| GET | `/api/users` | Konten und Institutionen (nur Administratorinnen). |
| POST | `/api/users` | Konto anlegen. Ohne mitgegebenes Passwort entsteht ein Einmalpasswort. |
| GET | `/api/users/:id` | Ein Konto. |
| PATCH | `/api/users/:id` | Stammdaten. Das eigene Konto laesst sich weder entmachten noch sperren. |
| DELETE | `/api/users/:id` | Konto loeschen. Importe bleiben bestehen. |
| POST | `/api/users/:id/password` | Passwort neu setzen; das Einmalpasswort erscheint genau einmal in der Antwort. |

Dateien mit fuehrendem Unterstrich (`_lib.ts`, `_run.ts`, `_source.ts`,
`_upload.ts`, `_record.ts`, `_schema.ts`) sind keine Endpunkte. Nitro erzeugt aus
ihnen keine Route; sie liegen dort, weil sie zu den Endpunkten dieses Bereichs
gehoeren.

## Formate und Konverter

Erkannt und gelesen werden CSV, TSV, XLSX, JSON, XML, MARC-XML und EAD.
Tabellarische Formate (CSV, TSV, XLSX) laufen ueber die Kopfzeilen-Aufloesung
und ein Mappingprofil; die uebrigen ueber einen Fingerabdruck und einen
fest eingebauten Konverter:

| Schluessel | Format |
|---|---|
| `avefi_json_v1` | AVefi nativ — wird unveraendert durchgereicht |
| `generic_json_v1` | Objektliste als JSON |
| `marcxml_v1` | MARC-XML |
| `ead_v1` | EAD |

Zum Trennzeichen von CSV: Es wird erkannt, nicht geraten. Zur Behandlung von
Excel-Datumswerten siehe `server/lib/converters/excelValue.ts` — `exceljs`
liefert Zeitpunkte in UTC, was ohne Gegenmassnahme aus dem 1. Januar den
31. Dezember des Vorjahres macht.

## Pruefung

Geprueft wird nicht in dieser Anwendung, sondern im Dienst `efi-conv`: derselbe
Validator und dieselben Zusatzregeln wie `efi-conv check`. Eine eigene
Schemapruefung waere eine zweite Wahrheit, die sich vom Original entfernt,
sobald sich das Schema aendert. Einzelheiten in `deployment.md`.

Ist der Dienst nicht erreichbar, wird die Datei erzeugt, aber der Bericht sagt
ausdruecklich, dass nicht geprueft wurde
(`code: validation_unavailable`, Schweregrad Warnung). Ein „validiert", das
niemand geprueft hat, waere schlimmer als ein offener Befund.

Beanstandungen tragen Schweregrad, Meldung und — soweit zuordenbar — Zeile,
Datensatznummer, Quellfeld, AVefi-Feld und den gekuerzten Wert. Manche tragen
zusaetzlich einen Vorschlag zur Behebung (`fix`), etwa „Konverter `duration`
einfuegen?". Die Oberflaeche darf ihn anbieten, wendet ihn aber nie von selbst
an: automatische Korrektur von Validierungsfehlern ist vertraglich
ausgeschlossen.
