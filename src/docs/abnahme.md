# Wegweiser zur Abnahme

Diese Seite sagt zu jedem Liefergegenstand aus der Leistungsbeschreibung, wo er
liegt und wie er sich pruefen laesst. Sie enthaelt selbst nichts Neues; sie
ist dafuer da, dass niemand suchen muss.

Stand: 02.09.2026. Wer eine Angabe hier nicht bestaetigt findet, hat einen
Fehler in dieser Seite gefunden und nicht in der Anwendung — bitte melden.

Zugang zu den Repositorien haben ausser dem Auftragnehmer bereits Elias
Oltmanns, Jasper Stratil und Matti Stoehr mit Schreibrecht.

## Leistungspaket B — Liefergegenstaende

| Liefergegenstand | Wo | Stand |
|---|---|---|
| Vollstaendiger Quellcode | `github.com/AV-EFI/avefi-importer`, Zweig `main` | liegt vor, am 10.09.2026 an die Organisation AV-EFI uebertragen |
| Eigenstaendiges Repository fuer den CSV-Importer | dasselbe Repository | liegt vor |
| Pull Request fuer das LIDO-Modul | [AV-EFI/efi-conv#34](https://github.com/AV-EFI/efi-conv/pull/34) | liegt vor, offen seit 01.09.2026 |
| Abhaengigkeits- und Lock-Dateien | `src/package.json`, `src/package-lock.json` | liegt vor |
| Mockup fuer das Importer-UI | die laufende Anwendung selbst; der PHP-Prototyp liegt unter dem Tag `php-final` | liegt vor |
| Automatisierte Tests der zentralen Funktionen | `src/tests/`, Aufruf `npm test` | 407 Tests, gruen |
| Dokumentierte Installation, Initialisierung, Start, Bau und Tests | [`deployment.md`](deployment.md), Abschnitte „Installation" bis „Tests" | liegt vor |
| Beispielkonfigurationen ohne Zugangsdaten | [`../.env.example`](../.env.example) | liegt vor: jede Variable mit Erklaerung, kein einziger echter Wert |
| Dokumentation des Mappingprofil-Formats | [`mapping-profile.md`](mapping-profile.md) | liegt vor |
| Dokumentation erforderlicher Umgebungsvariablen | [`deployment.md`](deployment.md), Abschnitt „Umgebungsvariablen" | liegt vor, vollstaendig gegen `process.env` im Code abgeglichen |
| Bekannte Einschraenkungen und getroffene Annahmen | [`../README.md`](../../README.md), Abschnitt „Bekannte Einschraenkungen und getroffene Annahmen" | liegt vor |
| Kurze Beschreibung der Komponenten- und API-Struktur | [`architecture.md`](architecture.md) | liegt vor, mit Endpunktverzeichnis |
| Reproduzierbar deploybare Anwendung | `Dockerfile`, `docker-compose.yml`, [`deployment.md`](deployment.md) | liegt vor |

## Technische Abnahme — die fuenf Schritte

Die Reihenfolge ist die aus der Leistungsbeschreibung. Jeder Schritt nennt,
woran er scheitert, damit ein Fehlschlag einzuordnen ist.

1. **Installieren, initialisieren, starten, bauen, testen nach Dokumentation.**
   [`deployment.md`](deployment.md). Das Datenbankschema legt die Anwendung
   beim Start selbst an und bricht ab, statt mit altem Schema hochzukommen;
   `DB_SCHEMA_AUTO=0` schaltet das fuer eine fremdverwaltete Datenbank aus.
2. **Den vereinbarten Testdatensatz vollstaendig verarbeiten.** Hochladen,
   Zuordnung pruefen, konvertieren. Der Verarbeitungsstand steht in der
   Importliste, daneben das Ergebnis der Schemapruefung.
3. **Das erzeugte AVefi-JSON besteht `efi-conv check`.** Die Pruefung laeuft im
   Sidecar mit demselben Paket, das spaeter die Lieferung prueft; die benutzte
   Schemaversion steht im Pruefbericht. Bekannter Stolperstein im Paderborner
   Datensatz: Die Zeilen 61/62 und 65/66 tragen dieselbe Signatur, und die
   Signatur ist auf die Exemplarkennung gemappt. Der Importer weist das als
   Beanstandung mit Zeilennummern aus, statt die Kennung still eindeutig zu
   machen. Das ist eine Frage an das Archiv, kein Fehler der Anwendung.
4. **Ein exportiertes Mappingprofil laesst sich wieder einlesen.** Export ueber
   `GET /api/mappings/:id/export`, Einlesen ueber die Profilliste. Format und
   Wiedereinlesen: [`mapping-profile.md`](mapping-profile.md), Abschnitt
   „Export und Wiedereinlesen".
5. **Derselbe Testdatensatz mit demselben Profil erzeugt ein semantisch
   identisches AVefi-JSON.** Was dafuer festgehalten wird, steht in
   `imports.run_config`: Profilversion, Profilformat- und AVefi-Schemaversion,
   Normdateneinstellungen und das einmal erkannte CSV-Trennzeichen.

## Was noch offen ist

* **Vokabularbeschriftungen.** 31 Beschriftungen stehen als Glossar zur
  Freigabe; bis dahin bleiben die bisherigen stehen. Die 33 unstrittigen kommen
  bereits aus dem Message-Katalog des Schemas.
* **TypeScript.** `npm run typecheck` meldet 37 Befunde. Keiner davon
  verhindert Bau oder Betrieb; die Liste gehoert zur Frontend-Abnahme und ist
  im Pad unter „Anforderungskriterien Frontend / UI" festgehalten.
* **Zentrale Kapselung der API-Zugriffe** und die **Anbindung an die
  AVefi-Authentifizierung**. Beides steht im Pad, beides ist Gegenstand der
  Frontend-Abnahme durch Stefan Stretz.
