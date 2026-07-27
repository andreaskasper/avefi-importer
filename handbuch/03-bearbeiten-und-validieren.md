# 3 · Datensätze bearbeiten & validieren

## Datensatz-Liste

Bei einem konvertierten Import öffnet **„✎ Bearbeiten"** die Liste der erzeugten
AVefi-Werke. Je Zeile: Titel (+ Beteiligte), Jahr, Typ, AVefi-PID, Anzahl
Manifestationen/Exemplare, **Vollständigkeit** (Ring) und ein **„ungültig"-Marker**,
falls der Datensatz das Schema noch nicht erfüllt.

- **Suche**: filtert die Liste nach Titel/PID.
- **⬇ AVefi-JSON**: lädt das Konvertierungsergebnis des Imports herunter
  (`/imports/<uuid>/avefi.json`).

Vollständigkeit = Anteil ausgefüllter Pflicht- + empfohlener Felder:
Rot < 50 %, Gelb < 80 %, Grün ≥ 80 %.

## Editor (AVefi-Schema)

Der Editor bearbeitet die **echte AVefi-Struktur** (WorkVariant → Manifestation → Item)
und ist eine interaktive Vue-Oberfläche mit den Reitern **Werk / Manifestationen / Exemplare**.

**Werk-Ebene:**

- **Titel** — beliebig viele Titel, jeder mit **Typ** (`TitleTypeEnum`: PreferredTitle,
  TitleProper, AlternativeTitle, TranslatedTitle …); ein Titel ist der primäre.
- **Schlagwörter · Personen · Orte** (`has_subject`) — pro Eintrag die Art wählen
  (Schlagwort / Person / Körperschaft / Ort). Beim Tippen schlägt das System **proaktiv
  Normdaten** vor (GND, Wikidata, VIAF); ein Klick hängt die ID als `same_as` an
  (sichtbar als Chip). Welche Quellen erlaubt sind, richtet sich pro Feld nach dem Schema.
- **Beteiligte** — Tätigkeit (Regie, Kamera, Musik …) + Person, die Person ebenfalls
  mit GND/Wikidata/VIAF verknüpfbar.
- **Ereignisse, Genre & Form, Identifier, Notizen** — jeweils wiederholbar.

**Manifestation / Exemplar:** Titel, Identifier, Notizen; beim Exemplar zusätzlich
Elementtyp, Farbe, Ton, Bildrate, Zugang, Dauer und Sprachen — alle Auswahllisten
kommen direkt aus dem Schema (`model.schema.json`).

**Speichern** schreibt den Datensatz als JSON, berechnet die Vollständigkeit neu und
aktualisiert `avefi.v1.json`. Über **{ } JSON** lässt sich der erzeugte AVefi-Datensatz
live ansehen.

## Schema-Prüfung

Beim Speichern wird der Datensatz gegen das **echte av-efi-schema**
(WorkVariant / Manifestation / Item, [`model.schema.json`](../src/html/schema/avefi/model.schema.json))
geprüft; Beanstandungen erscheinen als Hinweisliste (Speichern bleibt möglich — Kuratieren
ist iterativ). Der ausführliche Bericht liegt weiterhin unter **Report**.

> Normdaten-Autocomplete: Der Server ruft dafür GND (lobid.org), Wikidata und VIAF ab —
> ein Internet-Ausgang des Servers ist Voraussetzung.

## Prüfbericht (Fehlerreport)

Jeder verarbeitete Import erhält einen **Prüfbericht**. In der Import-Übersicht führt
der Button **„✓ Report"** bzw. **„⚠ Report"** (rot bei Beanstandungen) zur Seite
`/imports/<uuid>/report`. Der Bericht prüft das ausgelieferte `avefi.v1.json` gegen
das **echte av-efi-schema** (Klassen WorkVariant / Manifestation / Item) und zeigt:

- **Kennzahlen**: Datensätze (Werke), geprüfte AVefi-Records, schema-gültig, mit Beanstandung.
- **Parse-Hinweise**: Zeilen/Dateien, die nicht (vollständig) gelesen werden konnten
  (kaputtes CSV/TSV/JSON/XML, fehlende Pflichtspalten …).
- **Schema-Beanstandungen**: je Record die konkreten Verstöße (fehlende Pflichtfelder,
  unzulässige Enum-Werte, falsche/fehlende `category` …).

So lässt sich auch ein **bereits als AVefi eingereichtes, aber fehlerhaftes** Schema
gezielt prüfen: Der Report benennt jeden beanstandeten Record einzeln.

## AVefi-Ausgabe & natives AVefi

- Für CSV/TSV/JSON/MARC-XML/EAD wird intern gemappt und `avefi.v1.json` als echtes
  AVefi-Record-Set (`WorkVariant` + `Manifestation` + `Item`, verknüpft über
  `LocalResource`-IDs) geschrieben — siehe `AvefiMapper`.
- Ist die Quelle **bereits natives AVefi-JSON** (Array mit `category: "avefi:…"`,
  bzw. `has_record`-Container), wird sie **erkannt und unverändert durchgereicht**
  (kein erneutes Mapping); das Original bleibt erhalten. Beispiel: [`samples/avefi-native.json`](../samples/avefi-native.json).

## Fehlerdetails (Verarbeitungsfehler)

Schlägt die **Verarbeitung** fehl (Status **Fehler**), zeigt die Import-Übersicht
statt „Bearbeiten" einen roten Button **„⚠ Details"** → `/imports/<uuid>/details`.
Die Seite erklärt den Fehler konkret:

- **Stufe & Worker-Meldung**: In welchem Schritt (Download / Erkennung / Konvertierung)
  es hakte und die Roh-Fehlermeldung.
- **Position**: Zeile und Spalte des Fehlers.
- **Code-Ausschnitt**: die betroffene Zeile (± Kontext) mit markierter Fehlerstelle.
- **Lösungshinweis**: was konkret zu tun ist.

Erkannte Fehlerquellen:

| Format | Beispiele |
|--------|-----------|
| **JSON** | Syntaxfehler mit Zeile/Spalte: überzähliges/fehlendes Komma, nicht geschlossene Zeichenkette, fehlender Doppelpunkt, einfache statt doppelter Anführungszeichen, ungültiges Escape … (selbst-enthaltener `JsonLint`) |
| **XML/MARC-XML/EAD** | nicht geschlossene/verschachtelte Tags, ungültige Zeichen — Position via `libxml` |
| **CSV/TSV** | uneinheitliche Spaltenzahl (mit Zeilennummer), fehlende Titel-Spalte, keine Datenzeilen |
