# Formatpruefung

Adresse: `/reviews`  
Seitentitel im Browser: „Formatprüfung · AVefi Importer"  
Sprache des Dokuments: `de`

Die Liste der offenen und erledigten Formatpruefungen.

## Teil 1 — Was der Screenreader vorfindet

### Landmarken

In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:

1. Kopfbereich (banner), ohne Namen
  2. Navigation (navigation), Name „Hauptnavigation" — liegt innerhalb einer anderen Landmarke
3. Hauptbereich (main), ohne Namen

### Ueberschriften

- Stufe 1: „Formatprüfung"

### Tab-Reihenfolge

So werden die Bedienelemente mit der Tabulatortaste erreicht. Die Nummer ist die Zahl der Tastendruecke ab Seitenanfang.

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Importe" — Link, im navigation „Hauptnavigation"
4. „Zuordnungen" — Link, im navigation „Hauptnavigation"
5. „Format-Review 4 offene Aufgaben" — Link, im navigation „Hauptnavigation". als aktuell ausgezeichnet
6. „Design wechseln" — Schaltflaeche, im banner
7. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
8. „Format von „Erschließungsdaten_Expofilme_bearbeitet.xml“ prüfen" — Link, im main
9. „Format von „Erschließungsdaten_Expofilme_bearbeitet.xlsx“ prüfen" — Link, im main
10. „Format von „Zweiblatt.xlsx“ prüfen" — Link, im main
11. „Format von „Erschließungsdaten_Expofilme_bearbeitet.xlsx“ prüfen" — Link, im main

### Formularfelder

Keine Formularfelder.

### Tabellen

- Tabelle mit 8 Spalten und 4 Datenzeilen, im main.
  Beschriftung: caption „Offene Formatprüfungen mit Datei, Basisformat, Institution, Fingerabdruck und Eingangszeit".
  Spaltenueberschriften: 1. „Datei", 2. „Format", 3. „Institution", 4. „Fingerabdruck", 5. „Spalten", 6. „Eingegangen", 7. „Wartend", 8. „Aktion".

### Live-Bereiche

Das wird angesagt, ohne dass die Seite wechselt:

- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.

### Bilder und Symbole

Mit Alternativtext:

- Bild (av-efi-logo.svg): „AV-EFI" (aus alt).

### Auffaelligkeiten

Was beim Bedienen stoert. Das ist eine Beschreibung, keine Wertung nach WCAG — die maschinelle Pruefung steht in `tests/a11y/axe.mjs`.

- 2 mal derselbe Name „Format von „Erschließungsdaten_Expofilme_bearbeitet.xlsx“ prüfen" als Link im main. Es sind Zeilenaktionen einer Tabelle; beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.

## Teil 2 — Wie es raeumlich angeordnet ist

Gemessen in einem Fenster von 1500 mal 1100 Pixeln. Die Seite ist 1100 Pixel hoch und passt damit ohne Scrollen. Der Kopfbereich liegt am oberen Rand ueber die volle Breite und ist 63 Pixel hoch. Die Navigation „Hauptnavigation" sitzt innerhalb der Kopfzeile, oben links. Der Hauptbereich beginnt 85 Pixel unter dem Seitenanfang und ist 1120 Pixel breit; er ist mittig gesetzt und laesst links und rechts je rund 190 Pixel frei. Oben rechts stehen, von links nach rechts: „Design wechseln" (Schaltflaeche), „Benutzermenü: Administrator" (Schaltflaeche). Oben links stehen: „Zum Inhalt springen", „Zur Startseite", „Importe", „Zuordnungen", „Format-Review 4 offene Aufgaben".

Der Bildschirmabzug `12-formatpruefung.png` im selben Verzeichnis zeigt denselben Stand fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.

