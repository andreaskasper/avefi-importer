# Zuordnungsliste

Adresse: `/mappings`  
Seitentitel im Browser: „Zuordnungen · AVefi Importer"  
Sprache des Dokuments: `de`

Alle gespeicherten Mappingprofile.

## Teil 1 — Was der Screenreader vorfindet

### Landmarken

In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:

1. Kopfbereich (banner), ohne Namen
  2. Navigation (navigation), Name „Hauptnavigation" — liegt innerhalb einer anderen Landmarke
3. Hauptbereich (main), ohne Namen

### Ueberschriften

- Stufe 1: „Zuordnungen"
- Stufe 2: „Neue Zuordnung anlegen"

### Tab-Reihenfolge

So werden die Bedienelemente mit der Tabulatortaste erreicht. Die Nummer ist die Zahl der Tastendruecke ab Seitenanfang.

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Importe" — Link, im navigation „Hauptnavigation"
4. „Zuordnungen" — Link, im navigation „Hauptnavigation". als aktuell ausgezeichnet
5. „Format-Review 9 offene Aufgaben" — Link, im navigation „Hauptnavigation"
6. „Design wechseln" — Schaltflaeche, im banner
7. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
8. „Zuordnung beginnen" — Link, im main
9. „Stattdessen ein exportiertes Profil einlesen" — aufklappbare Ueberschrift, im main
10. „Zuordnung „Test Luca 24.08.“ bearbeiten" — Link, im main
11. „Zuordnung „Test Luca 24.08.“ ansehen" — Link, im main
12. „Zuordnung „Test Luca 24.08.“ als JSON exportieren" — Link, im main
13. „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ bearbeiten" — Link, im main
14. „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ ansehen" — Link, im main
15. „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ als JSON exportieren" — Link, im main
16. „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ bearbeiten" — Link, im main
17. „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ ansehen" — Link, im main
18. „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ als JSON exportieren" — Link, im main
19. „Zuordnung „Deutsches Filminstitut · mini“ bearbeiten" — Link, im main
20. „Zuordnung „Deutsches Filminstitut · mini“ ansehen" — Link, im main
21. „Zuordnung „Deutsches Filminstitut · mini“ als JSON exportieren" — Link, im main
22. „Zuordnung „Profil ohne Stichprobe“ ansehen" — Link, im main
23. „Zuordnung „Profil ohne Stichprobe“ als JSON exportieren" — Link, im main
24. „Zuordnung „Eingelesenes Profil“ bearbeiten" — Link, im main
25. „Zuordnung „Eingelesenes Profil“ ansehen" — Link, im main
26. „Zuordnung „Eingelesenes Profil“ als JSON exportieren" — Link, im main

### Formularfelder

- „Profil-Datei auswählen" — Dateiauswahl, Typ file, kein Pflichtfeld.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.

### Tabellen

- Tabelle mit 7 Spalten und 6 Datenzeilen, im main.
  Beschriftung: caption „Gespeicherte Mappingprofile".
  Spaltenueberschriften: 1. „Name", 2. „Einrichtung", 3. „Basis", 4. „Zustand", 5. „Verwendet", 6. „Geändert", 7. „Aktion".

### Live-Bereiche

Das wird angesagt, ohne dass die Seite wechselt:

- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.

### Bilder und Symbole

Mit Alternativtext:

- Bild (av-efi-logo.svg): „AV-EFI" (aus alt).

### Auffaelligkeiten

Was beim Bedienen stoert. Das ist eine Beschreibung, keine Wertung nach WCAG — die maschinelle Pruefung steht in `tests/a11y/axe.mjs`.

- 2 mal derselbe Name „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ bearbeiten" als Link im main. Es sind Zeilenaktionen einer Tabelle; beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.
- 2 mal derselbe Name „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ ansehen" als Link im main. Es sind Zeilenaktionen einer Tabelle; beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.
- 2 mal derselbe Name „Zuordnung „Deutsches Filminstitut · Erschließungsdaten_Expofilme_bearbeitet“ als JSON exportieren" als Link im main. Es sind Zeilenaktionen einer Tabelle; beim Durchgehen der Bedienelemente sind sie nicht auseinanderzuhalten.

## Teil 2 — Wie es raeumlich angeordnet ist

Gemessen in einem Fenster von 1500 mal 1100 Pixeln. Die Seite ist 1100 Pixel hoch und passt damit ohne Scrollen. Der Kopfbereich liegt am oberen Rand ueber die volle Breite und ist 63 Pixel hoch. Die Navigation „Hauptnavigation" sitzt innerhalb der Kopfzeile, oben links. Der Hauptbereich beginnt 85 Pixel unter dem Seitenanfang und ist 1120 Pixel breit; er ist mittig gesetzt und laesst links und rechts je rund 190 Pixel frei. Oben rechts stehen, von links nach rechts: „Design wechseln" (Schaltflaeche), „Benutzermenü: Administrator" (Schaltflaeche). Oben links stehen: „Zum Inhalt springen", „Zur Startseite", „Importe", „Zuordnungen", „Format-Review 9 offene Aufgaben".

Der Bildschirmabzug `08-zuordnungsliste.png` im selben Verzeichnis zeigt denselben Stand fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.

