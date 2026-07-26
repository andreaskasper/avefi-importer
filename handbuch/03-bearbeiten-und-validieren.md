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

## Editor

Der Editor bildet die AVefi-Hierarchie **Werk → Manifestation → Exemplar** ab:

- **Werk · Grunddaten**: Haupttitel\*, weitere Titel, Produktionsjahr\*, Herstellungsland,
  Werkart\*, Genre, Sprache, Beschreibung (\* = Pflichtfeld).
- **Beteiligte / Manifestationen / Exemplare**: wiederholbare Blöcke — mit „+ …"
  hinzufügen, mit 🗑 entfernen.
- **{ } JSON-Vorschau**: zeigt den Rohdatensatz.
- **✓ Speichern**: schreibt die Daten und **berechnet Vollständigkeit + Validierung neu**.

## Schema-Prüfung

Rechts im Editor:

- **Schema-Prüfung** — „Record ist schema-gültig" oder eine Liste konkreter Verstöße
  (z. B. *„work.work_type ist erforderlich"*, *„… hat einen unzulässigen Wert"*).
- **Empfehlungen** — fehlende, aber empfohlene Felder (Genre, Sprache, …).

Geprüft wird gegen [`src/html/schema/avefi-record.schema.json`](../src/html/schema/avefi-record.schema.json).
**Pflicht** sind aktuell Haupttitel, Produktionsjahr und Werkart (aus fester
Werkart-Liste). Erst ein **gültiger** Datensatz ist Voraussetzung für die spätere
[PID-Registrierung](06-pid-registrierung.md).

> Hinweis: MARC-XML/EAD liefern oft keine saubere Werkart — solche Datensätze sind
> zunächst „ungültig" und werden im Editor ergänzt.

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
