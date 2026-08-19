# 7 · Zuordnungen (Mapping-Profile)

Tabellarische Quellen — CSV und TSV — werden nicht mehr geraten, sondern zugeordnet.
Beim Upload bildet der Importer aus der Kopfzeile einen Schlüssel und sucht dazu ein
gespeichertes **Mapping-Profil**. Ist eines vorhanden, läuft die Konvertierung
durch. Ist keines vorhanden, pausiert der Import, bis jemand die Spalten zugeordnet
hat.

Das ist kein Fehlerfall, sondern der vorgesehene Weg: Welche Spalte „Sign." bedeutet,
weiß die Person, die die Datei hochgeladen hat — nicht das Programm.

## Der Schlüssel: die Kopfzeile

Der Schlüssel ist ein `md5` über die Spaltennamen (kleingeschrieben, getrimmt,
**sortiert**) plus das Basisformat. Sortiert deshalb, weil das Mapping Spalten über
ihren **Namen** anspricht: Exportiert dieselbe Einrichtung nächstes Jahr dieselben
Spalten in anderer Reihenfolge, greift das Profil weiterhin.

Umlaute bleiben erhalten — „Länge" und „Lange" sind verschiedene Spalten. Kommt ein
Spaltenname doppelt vor, wird er intern zu `Titel` und `Titel (2)`; sonst wäre die
zweite Spalte nicht ansprechbar.

## Wer darf zuordnen

Die Person, der der Import gehört (also die eigene Einrichtung). Administrator:innen
sehen zusätzlich alle Importe. Profile sind **für alle Einrichtungen sichtbar**, aber
ändern darf sie nur die Einrichtung, der sie gehören.

Beim Zuordnen bietet der Editor fremde Profile mit derselben Kopfzeile zur Übernahme
an. Übernommen wird eine **Kopie** — Änderungen daran verändern nichts am Original
einer anderen Einrichtung.

## Der Editor

Aufruf über den Knopf **„Zuordnen"** in der Importliste, später über
**„…" › „Zuordnung ansehen"**.

Die Arbeitsfläche ist eine Tabelle mit einer Zeile je Quellspalte:

| Spalte | Bedeutung |
|---|---|
| **Quellspalte** | Name aus der Kopfzeile |
| **Beispielwerte** | die ersten tatsächlich vorkommenden Werte |
| **Ziel** | wohin der Wert im AVefi-Schema gehört |
| **Ergebnis** | was dabei herauskommt — grün, oder rot mit Begründung |

Rechts steht der **Ergebnisbaum**: Werk, Fassung, Exemplar mit den belegten Feldern.
Er zeigt die Struktur, die entsteht, und woher jeder Wert kommt.

Jede Spalte hat einen von drei Zuständen: zugeordnet, ausdrücklich **ignoriert**, oder
**noch offen**. Erst wenn keine Spalte mehr offen ist, gilt das Profil als vollständig
und kann die Konvertierung starten. Der dritte Zustand ist der Grund für diese Regel —
ein halb ausgefülltes Profil erzeugt sonst stillschweigend leere Datensätze.

### Vorschläge

Der Editor schlägt zu jeder Spalte Ziele vor, aus zwei Quellen:

- **Namensähnlichkeit** — „Produktionsjahr" → Werk › Produktionsjahr. Verglichen wird
  auf Wortebene, nicht auf Zeichenketten; „Administration" wird deshalb nicht als
  Laufzeit („min") vorgeschlagen.
- **andere Profile** — hat eine gleichnamige Spalte anderswo ein Ziel, taucht es als
  Vorschlag auf, auch wenn die Kopfzeile insgesamt nicht passt.

Vorschläge werden nie automatisch übernommen. Ein Klick übernimmt sie.

### Konverter

Zwischen Quellwert und Ziel liegt eine Kette von Konvertern. Sie gliedert sich in
Schritte **vor** der Zuordnung (gelten für alle Ziele der Spalte) und **nach** der
Zuordnung (je Ziel).

| Gruppe | Operationen |
|---|---|
| Text | Leerraum entfernen, Klein-/Großschreibung, Ersetzen, Ausschnitt, Standardwert, Muster |
| Struktur | Aufteilen, Zusammenfügen, Element auswählen, Spalten verbinden |
| Typen | Zahl, Jahreszahl, Datum nach ISO, Laufzeit nach ISO 8601 |
| Vokabular | Werteliste zuordnen, Normdaten nachschlagen (GND/Wikidata/VIAF) |

**Laufzeiten** verlangt das AVefi-Schema als `PT01H30M00S` — mindestens zweistellig.
Der Konverter „Laufzeit nach ISO 8601" erzeugt genau dieses Format, egal ob die Quelle
„90", „1:30:00" oder „PT1H30M" liefert.

**Wertelisten** braucht jedes Ziel mit fester Auswahl (Farbe, Ton, Elementart …). Der
Knopf *„Werteliste aus der Datei vorbefüllen"* trägt die tatsächlich vorkommenden Werte
ein; einzutragen bleibt der jeweilige AVefi-Wert. Für nicht zugeordnete Werte gilt
standardmäßig *„als Notiz behalten"* — in einem Archivkontext ist Datenverlust das
schlimmere Übel als eine unsaubere Notiz.

**Normdaten** sind standardmäßig aus. Eingeschaltet fragen sie externe Dienste ab und
verlangsamen den Import spürbar; Ergebnisse werden dauerhaft zwischengespeichert, und
übernommen wird nur bei Eindeutigkeit.

### Prüfung

Geprüft wird an zwei Stellen:

- **Beim Bauen** — passt der Ausgabetyp der Kette zum Ziel? Fehlt ein Konverter, wird
  er vorgeschlagen und lässt sich mit einem Klick einsetzen.
- **Beim Konvertieren** — jeder Wert gegen Werteliste, Muster und Anzahl. Verstöße
  stehen zeilengenau im Prüfbericht.

Hinweise **blockieren nicht**. Quelldaten sind selten sauber, und „erstmal grob,
Feinschliff später" ist ein legitimer Arbeitsstand. Blockiert wird nur, was gar nicht
verarbeitbar wäre — etwa eine Liste in einem einwertigen Ziel ohne Auswahlregel.

### Festwerte

Füllen Felder, die die Datei nicht liefert: die ISIL der eigenen Einrichtung, ein
fester Zugangsstatus, eine Werkart. Sie greifen zuletzt und überschreiben nichts, was
aus der Quelle kam.

### Werkbildung

Standardmäßig wird **jede Zeile ein eigenes Werk**. Das ist selten richtig — dieselbe
Kopie steht oft in mehreren Zeilen, und ein Film hat mehrere Kopien —, aber es ist das
vorhersagbare Verhalten.

Eingeschaltet fasst die Werkbildung Zeilen zusammen, die in allen gewählten Merkmalen
übereinstimmen. Vorzuziehen ist eine echte Kennung aus den Daten; ersatzweise eine
Heuristik über Titel, Regie und Produktionsjahr. Verglichen wird auf den **gemappten**
Werten, nicht auf den Rohspalten — nach Trimmen und Kleinschreibung fallen
„Die Wilden Kerle " und „die wilden kerle" zusammen.

Die verwendete Regel und ihr Ergebnis stehen anschließend im Prüfbericht
(„4312 Zeilen → 3717 Werke, Regel: Haupttitel + Regie"). Damit ist eine abweichende
Werkzahl nachvollziehbar statt Verhandlungssache.

## Profile verwalten

Der Menüpunkt **Zuordnungen** listet alle Profile, eigene zuerst: Name, Einrichtung,
Basisformat, Zustand, Zahl der damit verarbeiteten Importe.

Auf der Detailseite stehen alle Zuordnungen, der **Versionsverlauf** und die
Möglichkeit, eine frühere Fassung wiederherzustellen. Jedes Speichern erhöht die
Version; jeder Import merkt sich, mit welchem Profil und welcher Fassung er entstanden
ist.

Ein geändertes Profil konvertiert **bestehende Importe nicht automatisch neu** — bei
global sichtbaren Profilen würde das fremde Importe im Hintergrund verändern. Wer den
neuen Stand anwenden will, nutzt in der Importliste **„…" › „Neu konvertieren"**.

### Export und Import

**Exportieren** legt das Profil als JSON-Datei mit Herkunftskopf ab. **Importieren**
liest sie wieder ein: Passt der Kopfzeilen-Schlüssel zu einem eigenen Profil, wird
dieses aktualisiert, sonst entsteht ein neues.

Das Format ist ein Artefakt dieses Importers und **kein** Austauschformat mit dem
Python-Konverter `efi-conv`.
