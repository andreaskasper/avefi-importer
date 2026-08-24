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

## Ein Profil anlegen — ohne vorherigen Import

Auf **Zuordnungen** genügt eine **Beispieldatei**: eine CSV oder TSV mit der Kopfzeile,
für die die Zuordnung gelten soll. Der Editor öffnet sich mit den echten Spalten und
Werten. Die Datei selbst wird nicht gespeichert — abgelegt werden die Spaltennamen und
etwa 25 Beispielzeilen, damit die Vorschau auch Monate später noch etwas zeigt.

Ist die Kopfzeile bereits bekannt, führt der Weg zum vorhandenen Profil und frischt
dessen Beispieldaten auf, statt ein zweites Profil für dieselbe Datei anzulegen.

Ein exportiertes Profil-JSON lässt sich weiterhin einlesen — es steht als Zweitweg
hinter „Stattdessen ein exportiertes Profil einlesen".

## Der Editor

Aufruf über den Knopf **„Zuordnen"** in der Importliste, über **„…" › „Zuordnung
ansehen"** oder über **„Bearbeiten"** auf der Seite Zuordnungen. Am Import kann er die
Konvertierung gleich anstoßen; am gespeicherten Profil wird nur gespeichert.

Die Arbeitsfläche ist eine Tabelle mit einer Zeile je Quellspalte:

| Spalte | Bedeutung |
|---|---|
| **Quellspalte** | Name aus der Kopfzeile, darunter die Belegung |
| **Beispielwerte** | bis zu drei verschiedene tatsächlich vorkommende Werte mit ihrer Häufigkeit |
| **Ziel** | wohin der Wert im AVefi-Schema gehört |
| **Ergebnis** | was aus jedem Beispiel wird — grün, oder rot mit Begründung |

Beispiel und Ergebnis stehen auf gleicher Höhe: die dritte Zeile links gehört zur
dritten Zeile rechts. Wer beides lieber nebeneinander liest, schaltet oben rechts auf
**Zusammen** um — dann steht `1953 → 1953` in einer Spalte. Die Wahl wird gemerkt.

**Die Beispiele werden gesucht, nicht abgezählt.** Der Editor nimmt je Spalte die ersten
drei *verschiedenen gefüllten* Werte, nicht die ersten drei Zeilen. Das ist wichtiger,
als es klingt: In der Paderborner Liste hat die erste Zeile kein Produktionsjahr und die
ersten drei keine Regieangabe — eine Vorschau, die an Zeile 1 klebt, zeigt dort nichts
und sieht aus, als sei die Zuordnung kaputt. Bei Wertelisten hat die Suche nach
*verschiedenen* Werten einen zweiten Nutzen: Man sieht sofort, ob alle vorkommenden
Schreibweisen abgedeckt sind.

Unter dem Spaltennamen steht die Belegung („gefüllt in 57 von 77 Zeilen"), sobald es
Lücken gibt. Ist eine Spalte in der ganzen Stichprobe leer, sagt der Editor das
ausdrücklich — dann weiß man, dass nicht die Zuordnung schuld ist.

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

### Eine Spalte, mehrere Ziele

Eine Quellspalte kann in beliebig viele Ziele fließen. Klappt man eine Zeile auf, zeigt
der Editor die Verzweigung:

```
Spalte „Regie"
  │
  ├─ Konverter für alle Ziele:   Leerraum entfernen
  │
  ├── Zweig 1 ── Aufteilen „;" ──→ Werk › Beteiligte › Regie      → Lang, Murnau
  └── Zweig 2 ── Normdaten GND ──→ Werk › Erschließung › Person   → 118569120
```

Die obere Kette gilt für alle Zweige; jeder Zweig hat darunter seine eigene Kette und
sein eigenes Ziel. Unter jedem Zweig steht, was für die erste Beispielzeile dabei
herauskommt. In der zusammengeklappten Zeile erscheinen die Ziele als Kürzel, bei mehr
als einem zusätzlich die Zahl der Zweige.

### Konverter

Zwischen Quellwert und Ziel liegt eine Kette von Konvertern. Sie gliedert sich in
Schritte **vor** der Zuordnung (gelten für alle Zweige der Spalte) und **nach** der
Zuordnung (je Zweig).

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
übernommen wird nur bei Eindeutigkeit — genau ein Treffer, dessen Name exakt auf die
Anfrage passt.

Der GND-Abgleich vergleicht auch die umgedrehte Namensform: Die GND führt Personen als
„Sielmann, Heinz", in Tabellen steht „Heinz Sielmann". Ohne diesen Vergleich blieben
Personen praktisch immer ohne Treffer, während Körperschaften und Orte gefunden wurden.

Der Konverter **ersetzt den Wert nicht, er ergänzt ihn**. Aus „Heinz Sielmann" wird also
nicht die GND-Nummer, sondern:

```json
{ "category": "avefi:Agent",
  "has_name": "Heinz Sielmann",
  "type": "Person",
  "same_as": [ { "category": "avefi:GNDResource", "id": "1337928623" } ] }
```

Das greift bei Personen, Schlagwörtern, Orten und Genres. Bei den reinen Kennungs-Zielen
(Werk › Kennungen › Verknüpfung GND) ist die ID der eigentliche Wert und wird als solcher
eingetragen. Hängt der Konverter an einem Ziel, das keine Normdaten aufnehmen kann — etwa
am Haupttitel —, weist der Editor darauf hin. Angehängt werden nur Quellen, die das Schema
für die jeweilige Klasse vorsieht; eine Wikidata-ID an einem Genre bleibt außen vor.

### Bestätigte Zuordnungen

Bleibt ein Name mehrdeutig — „Günther Wolf" gibt es in der GND mehrfach —, trägt der
Importer **nichts** ein. Eine falsche Normdaten-ID wandert in den Verbund und ist später
schwer zu korrigieren; eine Lücke füllt jemand nach.

Im aufgeklappten Zweig steht deshalb unter der Kette eine Liste der vorkommenden Werte
mit ihrem Stand: automatisch aufgelöst, von Hand bestätigt oder bewusst offen gelassen.
Über **Zuordnen** zeigt der Editor die Kandidaten samt Beruf und Lebensdaten; die
Auswahl wird im Profil festgehalten und gilt beim nächsten Import weiter. **Bewusst
offen lassen** merkt sich, dass jemand vergeblich gesucht hat — dann fragt der Editor
nicht wieder danach.

Bestätigte Zuordnungen gelten vor der Automatik. Umgekehrt wird nie ein automatisches
Ergebnis als bestätigt ausgegeben: Sonst könnte später niemand mehr sagen, was geprüft
ist und was geraten. Der Prüfbericht weist beides getrennt aus.

### Länderangaben

Der Konverter **Land** führt die gängigen Schreibweisen zusammen: `DE`, `DEU`, `D`,
`BRD` und `Deutschland` ergeben alle „Deutschland" samt GND-Verweis. Historische Formen
wie `CSSR`, `UdSSR` oder `DE bis 1945` sind ebenfalls hinterlegt.

Stehen mehrere Länder in einer Zelle (`GRL/DE`), gehört ein **Aufteilen** auf `/` davor —
dann entstehen zwei Produktionsländer statt eines Ortsnamens mit Schrägstrich. Der Editor
schlägt das von selbst vor, sobald er ein Trennzeichen in den Beispielwerten sieht.

Die Tabelle liegt als `src/html/data/countries.json` im Repo und stammt aus Wikidata
(ISO 3166-1 mit deutschem Namen und GND-ID). Eigene Schreibweisen lassen sich dort
nachtragen.

### Prüfung

Geprüft wird an zwei Stellen:

- **Beim Bauen** — passt der Ausgabetyp der Kette zum Ziel? Fehlt ein Konverter, wird
  er vorgeschlagen und lässt sich mit einem Klick einsetzen.
- **Beim Konvertieren** — jeder Wert gegen Werteliste, Muster und Anzahl. Verstöße
  stehen zeilengenau im Prüfbericht.

Die Schema-Prüfung im Editor läuft über alle für die Vorschau gerechneten Zeilen, nicht
nur über die erste; gleiche Beanstandungen werden zusammengefasst und mit ihrer
Häufigkeit gezeigt.

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

**Exportieren** legt das Profil als JSON-Datei mit Herkunftskopf ab. Darin stecken auch
die Beispieldaten — ohne sie kann der Editor beim Empfänger keine Vorschau rechnen. Die
Datei enthält damit einige echte Zeilen aus der Quelltabelle; das ist beim Weitergeben zu
bedenken.

**Importieren** liest sie wieder ein: Passt der Kopfzeilen-Schlüssel zu einem eigenen
Profil, wird dieses aktualisiert, sonst entsteht ein neues. Stammt die Datei aus einem
älteren Export ohne Beispieldaten, sagt der Importer das und bietet an, eine passende
Tabelle nachzureichen — die Spaltennamen müssen dabei dieselben sein.

Das Format ist ein Artefakt dieses Importers und **kein** Austauschformat mit dem
Python-Konverter `efi-conv`.
