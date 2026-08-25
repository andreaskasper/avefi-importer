# Beispieldateien

Derselbe kleine Bestand von drei Filmen in verschiedenen Ausgangsformaten, zum
Ausprobieren der Importstrecke. Eine Datei über die Oberfläche hochladen, den
Rest erledigt der Worker.

| Datei | Format | Was damit passiert |
|---|---|---|
| `films.csv` | CSV, kommagetrennt, 12 Spalten | **Zuordnung nötig** — siehe unten |
| `films.tsv` | TSV, tabulatorgetrennt | **Zuordnung nötig** — siehe unten |
| `films.xlsx` | Excel-Arbeitsmappe, zwei Blätter | Deckblatt fällt heraus, dann Zuordnung |
| `films.json` | JSON, Liste von Objekten | konvertiert unmittelbar |
| `films.marcxml` | MARC 21 slim (`<collection>`/`<record>`) | konvertiert unmittelbar |
| `films.ead` | EAD-Findbuch mit drei Verzeichnungseinheiten | konvertiert unmittelbar |
| `avefi-native.json` | bereits im AVefi-Schema | wird übernommen, nicht umgewandelt |

## Warum Tabellen nach einer Zuordnung fragen

CSV, TSV und XLSX laufen über den **Kopfzeilen-Hash**: Der Importer erkennt eine
Kopfzeile wieder und schlägt das dazu gespeicherte Mappingprofil vor. Solange es
für eine Kopfzeile noch kein Profil gibt, pausiert der Import mit dem Zustand
*Zuordnung nötig* und der Mapping-Editor öffnet sich über den Knopf **Zuordnen**.

Das ist kein Fehler, sondern der vorgesehene Weg: Welche Spalte welches
AVefi-Feld füllt, kann nur jemand entscheiden, der den Bestand kennt. Für
`films.csv` reichen wenige Zuordnungen — Titel, Jahr, Regie und Signatur genügen
für ein gültiges Ergebnis.

XML-basierte Formate und JSON brauchen das nicht, weil ihre Struktur die
Bedeutung schon mitbringt.

## Wie `films.xlsx` behandelt wird

Die Arbeitsmappe hat zwei Blätter: ein Deckblatt und das Blatt **Filme** mit den
Daten. Brauchbar ist nur eines — als Datenblatt gilt, was mindestens zwei
Spalten und eine Datenzeile hat, das Deckblatt fällt damit von selbst heraus.
Bleibt genau ein Blatt übrig, nimmt der Importer es ohne Rückfrage; die Datei
landet direkt bei *Zuordnung nötig* und zeigt in der Formatspalte
`Excel · Blatt „Filme" · 12 Spalten`.

Erst bei **mehreren** brauchbaren Blättern erscheint die Auswahlseite. Jedes
gewählte Blatt wird dann ein eigener Import, weil zwei Blätter mit
verschiedenen Spalten auch verschiedene Profile brauchen.

## Nicht enthalten: `.xls` und `.ods`

Beide werden nicht mehr gelesen. Der Grund steht in der
[README](../README.md#bekannte-einschraenkungen-und-annahmen). Wer solche Dateien
hat, speichert sie in Excel oder LibreOffice als `.xlsx` und lädt diese hoch; der
Importer weist die alten Formate mit genau diesem Hinweis ab.

## Hinweise im Prüfbericht

Bei `films.json`, `films.marcxml` und `films.ead` erscheint im Prüfbericht der
Hinweis, dass die Sprachangabe nicht übernommen wurde. Das ist beabsichtigt: Für
diese Formate gibt es keine gesicherte Abbildung der Sprachbezeichnung auf das
AVefi-Vokabular, und geraten wird nicht. Der Hinweis ist eine Warnung, keine
Beanstandung — die Datensätze sind schemakonform.
