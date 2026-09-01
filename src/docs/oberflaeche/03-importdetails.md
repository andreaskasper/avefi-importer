# Importdetails

Adresse: `/imports/0d85bdc8-a395-40ca-85cf-44d4a6989835`  
Seitentitel im Browser: „neu_UPB_Archiv_Test_Kopie.csv · Details · AVefi Importer"  
Sprache des Dokuments: `de`

Ein einzelner Import mit seinem Stand und den Wegen weiter zu Zuordnung, Datensaetzen und Bericht.

## Teil 1 — Was der Screenreader vorfindet

### Landmarken

In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:

1. Kopfbereich (banner), ohne Namen
  2. Navigation (navigation), Name „Hauptnavigation" — liegt innerhalb einer anderen Landmarke
3. Hauptbereich (main), ohne Namen
  4. Navigation (navigation), Name „Details" — liegt innerhalb einer anderen Landmarke
    5. Bereich (region), Name „Datei hochladen" — liegt innerhalb einer anderen Landmarke

### Ueberschriften

- Stufe 1: „neu_UPB_Archiv_Test_Kopie.csv"
- Stufe 2: „Was jetzt zu tun ist"
- Stufe 2: „Eckdaten"
- Stufe 2: „Herunterladen"
- Stufe 2: „Berichtigte Datei hochladen"
- Stufe 2: „Dateien hier ablegen oder auswählen"

### Tab-Reihenfolge

So werden die Bedienelemente mit der Tabulatortaste erreicht. Die Nummer
ist die Zahl der Tastendruecke ab Seitenanfang.

Die Reihenfolge haengt von der Fensterbreite ab, deshalb stehen hier zwei
Durchlaeufe. Unterhalb von 820 Pixeln liegt die Hauptnavigation hinter einem
Aufklappknopf; darueber steht sie offen in der Kopfzeile. Wer die Darstellung
vergroessert, bekommt die schmale Fassung, auch am grossen Bildschirm.

#### Breites Fenster (1500 Pixel)

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Importe" — Link, im navigation „Hauptnavigation". als aktuell ausgezeichnet
4. „Zuordnungen" — Link, im navigation „Hauptnavigation"
5. „Format-Review 9 offene Aufgaben" — Link, im navigation „Hauptnavigation"
6. „Design wechseln" — Schaltflaeche, im banner
7. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
8. „Importe" — Link, im navigation „Details"
9. „Zur Übersicht" — Link, im main
10. „Prüfbericht öffnen" — Link, im main
11. „Zuordnung bearbeiten" — Link, im main
12. „Prüfbericht öffnen" — Link, im main
13. „Original herunterladen" — Link, im main
14. „Zwischenstand herunterladen (nicht validiert)" — Link, im main
15. „Metadaten-Dateien auswählen" — Dateiauswahl, im region „Datei hochladen"
16. „Adresse der Metadaten-Datei" — Eingabefeld, im region „Datei hochladen"
17. „Von Adresse laden" — Schaltflaeche, im region „Datei hochladen"

#### Schmales Fenster (800 Pixel)

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Navigation aufklappen" — Schaltflaeche, im banner. aufklappbar, derzeit zu
4. „Design wechseln" — Schaltflaeche, im banner
5. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
6. „Importe" — Link, im navigation „Details"
7. „Zur Übersicht" — Link, im main
8. „Prüfbericht öffnen" — Link, im main
9. „Zuordnung bearbeiten" — Link, im main
10. „Prüfbericht öffnen" — Link, im main
11. „Original herunterladen" — Link, im main
12. „Zwischenstand herunterladen (nicht validiert)" — Link, im main
13. „Metadaten-Dateien auswählen" — Dateiauswahl, im region „Datei hochladen"
14. „Adresse der Metadaten-Datei" — Eingabefeld, im region „Datei hochladen"
15. „Von Adresse laden" — Schaltflaeche, im region „Datei hochladen"

### Formularfelder

- „Metadaten-Dateien auswählen" — Dateiauswahl, Typ file, kein Pflichtfeld.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „Adresse der Metadaten-Datei" — Eingabefeld, Typ url, kein Pflichtfeld.
  Beschriftung kommt aus: aria-label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.

### Tabellen

Keine Tabellen.

### Live-Bereiche

Das wird angesagt, ohne dass die Seite wechselt:

- Meldungsbereich (alert), Ansageart assertive (aus role=alert).
  Aktueller Inhalt: „Die Verarbeitung ist fehlgeschlagen. Unten steht, woran es lag und was sich dagegen tun lässt. Prüfbericht öffnen Zuordnung bearbeiten".
- Meldungsbereich (alert), Ansageart assertive (aus role=alert).
  Aktueller Inhalt: „Fehlgeschlagen bei: Konvertierung Meldung der Verarbeitung: column "run_config" of relation "imports" does not exist".
- Element (generic), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.
- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.
- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.

### Bilder und Symbole

Mit Alternativtext:

- Bild (av-efi-logo.svg): „AV-EFI" (aus alt).

### Auffaelligkeiten

Was beim Bedienen stoert. Das ist eine Beschreibung, keine Wertung nach WCAG — die maschinelle Pruefung steht in `tests/a11y/axe.mjs`.

- 2 mal derselbe Name „Prüfbericht öffnen" als Link im main. Beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.

## Teil 2 — Wie es raeumlich angeordnet ist

Gemessen in einem Fenster von 1500 mal 1100 Pixeln. Die Seite ist 1386 Pixel hoch, muss also gescrollt werden. Der Kopfbereich liegt am oberen Rand ueber die volle Breite und ist 63 Pixel hoch. Die Navigation „Hauptnavigation" sitzt innerhalb der Kopfzeile, oben links. Der Hauptbereich beginnt 85 Pixel unter dem Seitenanfang und ist 1120 Pixel breit; er ist mittig gesetzt und laesst links und rechts je rund 190 Pixel frei. Der Bereich „Datei hochladen" liegt unten mittig und ist 1084 Pixel breit. Oben rechts stehen, von links nach rechts: „Zur Übersicht" (Link), „Design wechseln" (Schaltflaeche), „Benutzermenü: Administrator" (Schaltflaeche). Oben links stehen: „Zum Inhalt springen", „Zur Startseite", „Importe", „Zuordnungen", „Importe". Die breiten Schaltflaechen im Inhalt sind „Von Adresse laden" (rechts, erst nach dem Scrollen sichtbar).

Der Bildschirmabzug `03-importdetails.png` im selben Verzeichnis zeigt denselben Stand fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.

