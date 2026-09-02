# Schema-Editor

Adresse: `/mappings/new`  
Seitentitel im Browser: „Neue Zuordnung · AVefi Importer"  
Sprache des Dokuments: `de`

Ein neues Mappingprofil gegen das AVefi-Schema anlegen.

## Teil 1 — Was der Screenreader vorfindet

### Landmarken

In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:

1. Kopfbereich (banner), ohne Namen
  2. Navigation (navigation), Name „Hauptnavigation" — liegt innerhalb einer anderen Landmarke
3. Hauptbereich (main), ohne Namen
  4. Navigation (navigation), Name „Neue Zuordnung" — liegt innerhalb einer anderen Landmarke

### Ueberschriften

- Stufe 1: „Zuordnung aus einer Beispieldatei anlegen"
- Stufe 2: „Beispieldatei wählen"

### Tab-Reihenfolge

So werden die Bedienelemente mit der Tabulatortaste erreicht. Die Nummer
ist die Zahl der Tastendruecke ab Seitenanfang.

Die Reihenfolge haengt von der Fensterbreite ab, deshalb stehen hier zwei
Durchlaeufe. Unterhalb von 820 Pixeln liegt die Hauptnavigation hinter einem
Aufklappknopf; darueber steht sie offen in der Kopfzeile. Wer die Darstellung
vergroessert, bekommt die schmale Variante, auch am grossen Bildschirm.

#### Breites Fenster (1500 Pixel)

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Importe" — Link, im navigation „Hauptnavigation"
4. „Zuordnungsprofile" — Link, im navigation „Hauptnavigation". als aktuell ausgezeichnet
5. „Format-Review 9 offene Aufgaben" — Link, im navigation „Hauptnavigation"
6. „Design wechseln" — Schaltflaeche, im banner
7. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
8. „Zuordnungsprofile" — Link, im navigation „Neue Zuordnung"
9. „Beispieldatei auswählen" — Dateiauswahl, im main
10. „Abbrechen" — Link, im main

#### Schmales Fenster (800 Pixel)

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Navigation aufklappen" — Schaltflaeche, im banner. aufklappbar, derzeit zu
4. „Design wechseln" — Schaltflaeche, im banner
5. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
6. „Zuordnungsprofile" — Link, im navigation „Neue Zuordnung"
7. „Beispieldatei auswählen" — Dateiauswahl, im main
8. „Abbrechen" — Link, im main

### Formularfelder

- „Beispieldatei auswählen" — Dateiauswahl, Typ file, kein Pflichtfeld.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.

### Tabellen

Keine Tabellen.

### Live-Bereiche

Das wird angesagt, ohne dass die Seite wechselt:

- Meldungsbereich (alert), Ansageart assertive.
  Aktueller Inhalt: leer, meldet also gerade nichts.
- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.

### Bilder und Symbole

Mit Alternativtext:

- Bild (av-efi-logo.svg): „AV-EFI" (aus alt).

### Auffaelligkeiten

Nichts, was beim Bedienen im Weg steht.

## Teil 2 — Wie es raeumlich angeordnet ist

Gemessen in einem Fenster von 1500 mal 1100 Pixeln. Die Seite ist 1100 Pixel hoch und passt damit ohne Scrollen. Der Kopfbereich liegt am oberen Rand ueber die volle Breite und ist 63 Pixel hoch. Die Navigation „Hauptnavigation" sitzt innerhalb der Kopfzeile, oben links. Der Hauptbereich beginnt 85 Pixel unter dem Seitenanfang und ist 1120 Pixel breit; er ist mittig gesetzt und laesst links und rechts je rund 190 Pixel frei. Oben rechts stehen, von links nach rechts: „Design wechseln" (Schaltflaeche), „Benutzermenü: Administrator" (Schaltflaeche). Oben links stehen: „Zum Inhalt springen", „Zur Startseite", „Importe", „Zuordnungsprofile", „Zuordnungsprofile".

Der Bildschirmabzug `11-schema-editor.png` im selben Verzeichnis zeigt denselben Stand fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.

