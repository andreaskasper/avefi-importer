# AVefi Importer — Architektur

**Domain:** import.av-efi.net (interim: avefiimporter.goo1.de)
**Ziel:** Beliebige Metadaten-Dateien (CSV/TSV/XML/EAD/MARC-XML/JSON) hochladen →
Format erkennen → ins **AVefi-Schema** (LinkML → JSON) konvertieren → editieren → PID registrieren.

> **Umsetzungsstand:** Login und Import-Übersicht sind aktuell **serverseitig mit
> einem schlanken PHP-Micro-Framework** umgesetzt (siehe `README.md`), Datenhaltung
> in **PostgreSQL**. Die unten skizzierte Nuxt-Frontend-Option bleibt für ein
> späteres, entkoppeltes Frontend offen — Frontend und Worker koppeln ohnehin nur
> über Datenbank + Dateisystem.

## Stack-Entscheidung

| Schicht | Technologie | Begründung |
|---|---|---|
| Frontend | **Nuxt 4 + Tailwind + FormKit** | Konsistenz mit bestehendem `AV-EFI/frontend`, Komponenten-Wiederverwendung |
| API | Nuxt/Nitro *oder* schlanke PHP-API | REST, spricht PostgreSQL |
| **Worker** | **PHP** (CLI, via `supervisor`) | Streaming-Parsing (`XMLReader`, `SplFileObject`) ist in PHP exzellent; vorhandene Erfahrung |
| Queue | **PostgreSQL-Tabelle `worker_jobs`** (`FOR UPDATE SKIP LOCKED`) | Kein Redis nötig; ein `worker`-Daemon (`bot -t worker`, `restart: always`) pollt jede Minute und ruft `\worker\<classname>::run($payload)`; Selbst-Neustart nach 7 Tagen bzw. RAM > 1 GB |
| Validierung | **JSON Schema** (aus av-efi-schema LinkML generiert), `opis/json-schema` | Sprachneutral: LinkML → JSON Schema → in PHP validierbar |

> Frontend und Worker sind entkoppelt: sie kommunizieren **nur** über PostgreSQL + Dateisystem.
> Deshalb ist die Framework-Wahl (Nuxt) unabhängig von der Worker-Sprache (PHP).

## Verarbeitungs-Pipeline

```
Upload (Dropzone.js, %)         status = uploading
   └─ Datei gespeichert         status = queued        + job(detect)
Worker: detect
   ├─ base_format bestimmen (Endung/MIME/Sniffing)
   ├─ Fingerprint berechnen (siehe unten)
   ├─ Fingerprint in HARDCODED Registry?
   │     JA  → format_profile gesetzt   status = converting  + job(convert)
   │     NEIN→ format_reviews(open)      status = awaiting_format_review
   │           + E-Mail an Admin  ("Institution X hat neues Format hochgeladen")
Worker: convert   (nur bei bekanntem Profil)
   ├─ Converter-Klasse laden (converter_key → Klasse)
   ├─ Records erzeugen (Work + Manifestation + Item)
   ├─ je Record: gegen JSON Schema validieren + completeness berechnen
   └─ records[] speichern                status = converted   (editierbar)
```

## Fingerprint & Converter (HARDCODED)

Kein visuelles Mapping-Tool für Endnutzer: Das Mapping steckt in **Code-Klassen**.
Ein neues Format ⇒ Entwickler:in schreibt eine neue Converter-Klasse und registriert
ihren Fingerprint. Bis dahin bleibt der Import auf `awaiting_format_review`.

### Fingerprint-Bildung
- **CSV/TSV:** normalisierte, sortierte Header-Spalten → `sha1(strtolower(join(',', sort(headers))))`
- **XML/EAD/MARC-XML:** Root-Element + Namespace + Set der Kind-Element-Namen (erste Ebene)
- **JSON:** sortierte Top-Level-Keys (+ Keys des ersten Array-Elements)

### Registry (hardcoded)

```php
// src/Format/FingerprintRegistry.php
final class FingerprintRegistry
{
    /** fingerprint => converter_key */
    private const MAP = [
        '9a1f…dfi'   => 'dfi_csv_v3',
        'c4e2…kine'  => 'kinemathek_tsv_v1',
        'ab77…ead'   => 'ead_findbuch_v2',
        'e0d3…marc'  => 'marcxml_generic',
    ];

    public static function resolve(string $fingerprint): ?string
    {
        return self::MAP[$fingerprint] ?? null;   // null => Review-Queue
    }
}
```

### Converter-Interface

```php
interface Converter
{
    /** liefert converter_key (muss zur Registry passen) */
    public static function key(): string;

    /**
     * Streamt die Quelldatei und liefert AVefi-Records.
     * @return iterable<AvefiRecord>   Work + Manifestations + Items
     */
    public function convert(string $path): iterable;
}
```

Beispiel-Registrierung: `converter_key = 'dfi_csv_v3'` ⇒ `DfiCsvV3Converter`.
Ein `ConverterFactory` mappt `converter_key` → Klasse (ebenfalls hardcoded).

## AVefi-Schema (Zielformat)

Hierarchie (aus `AV-EFI/av-efi-schema`, LinkML):

```
Work            konzeptuelles Filmwerk   (Titel, Jahr, Werkart, Beteiligte, Identifier)
  └─ Manifestation   Fassung/Ausgabe     (Träger, Länge, Sprache, Farbe/Ton, Datum)
       └─ Item       Exemplar            (haltende Institution, Signatur, Standort, Zustand)
```

- Validierung: LinkML generiert **JSON Schema**. Das echte Schema liegt im Repo unter
  `src/html/schema/avefi/model.schema.json` (aus `AV-EFI/av-efi-schema`). Aktuell prüft
  der Editor gegen das schlanke Interim-Schema `avefi-record.schema.json`; die Abbildung
  der internen Records auf die echten LinkML-Property-Namen (WorkVariant/Manifestation/
  Item) ist der nächste Schritt — Manifestation/Item sind dabei **PID-abhängig**
  (`is_manifestation_of` / `is_item_of` verweisen auf die PID der Elternebene).
- `completeness` = Anteil ausgefüllter Pflicht- + empfohlener Felder laut Schema (0–100).
- PID-Registrierung (`21.11155/…`) erfolgt separat (`job(register_pid)`), erst nach `valid`.

## Offene To-dos
- [ ] JSON Schema aus av-efi-schema ziehen und Pflicht-/Empfohlen-Felder je Klasse extrahieren
- [ ] Konkrete Feldliste für Editor-Formular (FormKit) ableiten
- [ ] Auth: Passwort (Argon2id) + optional Shibboleth/eduGAIN
- [ ] Ersten Converter (`dfi_csv_v3`) an echter Beispieldatei bauen

> Vue-Oberflächen prüfen (Template-Übersetzung und Mount ohne Browser):
> siehe [`frontend-pruefen.md`](frontend-pruefen.md).

## Achtung beim Ändern von Worker-Code

Der Worker hält Klassen im Speicher. `bots/worker` läuft als Dauerprozess und lädt eine
Klasse wie `\worker\convert` genau einmal; danach bleibt die Definition im Prozess,
auch wenn die Datei sich ändert. Änderungen an Worker-Code wirken deshalb erst nach

```bash
docker restart avefi_worker
```

Das ist beim Testen leicht zu übersehen: Die Weboberfläche zeigt sofort den neuen Stand,
die Verarbeitung im Hintergrund noch den alten.

Deshalb beendet sich der Prozess seit dem 25.08.2026 **alle zehn Minuten** von selbst und
wird von `restart: always` neu gestartet; geänderter Worker-Code kommt damit ohne Zutun an.
Die Laufzeit lässt sich über `WORKER_MAX_UPTIME` (Sekunden) ändern. Wer sofort testen will,
startet weiterhin von Hand neu.
