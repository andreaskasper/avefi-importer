# 4 · Format-Review (Admin)

Wird der Fingerabdruck einer hochgeladenen Datei keinem Converter zugeordnet, pausiert
der Import mit Status **„Neues Format – Review nötig"**. Administrator:innen lösen das
über den Menüpunkt **Format-Review** (mit Zähler-Badge) in der Kopfzeile.


## Hinweis: CSV und TSV laufen über Zuordnungen

Tabellarische Quellen erreichen dieses Review nicht mehr. Sie werden über den
Kopfzeilen-Schlüssel einem **Mapping-Profil** zugeordnet; fehlt eines, öffnet der
Importer den Zuordnungs-Editor für die Person, der der Import gehört — siehe
[Zuordnungen](07-zuordnungen.md). Das Format-Review bleibt für XML, EAD, MARC-XML und
JSON zuständig, wo die Struktur ein Code-Converter auflöst.

## Übersicht

`/reviews` listet alle offenen Reviews: Datei, Format, hochladende Institution,
Fingerprint, Datum. **„Prüfen"** öffnet das Detail.

## Detailseite

- **Erkennung**: Basis-Format, Fingerprint, „Kein Converter", Anzahl Spalten/Elemente.
- **Struktur-Vorschau**: erste Spalten/Zeilen (tabellarisch) bzw. Root-Element,
  Namespace und Kind-Elemente (XML) — als Grundlage für die Zuordnung.
- **Auflösung**:
  - **Converter zuordnen & konvertieren** — einen vorhandenen Converter wählen
    (z. B. „Generisch (Tabelle)", „MARC-XML", „EAD"); der Import wird damit erneut
    verarbeitet.
  - **Datei herunterladen** — Originaldatei ansehen.
  - **Ablehnen** — Import verwerfen (Status „Fehler").

## Neues Format dauerhaft unterstützen

Für ein wiederkehrendes, bislang unbekanntes Format schreibt die Entwicklung einen
eigenen **Converter** (Klasse, die das `Converter`-Interface implementiert) und
registriert dessen Schlüssel in der `ConverterFactory`. Danach werden Dateien dieses
Formats automatisch erkannt. Details: `src/docs/architecture.md`.
