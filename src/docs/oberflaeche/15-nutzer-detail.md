# Nutzer im Einzelnen

Adresse: `/users/1`  
Seitentitel im Browser: „admin@av-efi.net · Nutzerverwaltung · AVefi Importer"  
Sprache des Dokuments: `de`

Ein einzelnes Konto zum Bearbeiten.

## Teil 1 — Was der Screenreader vorfindet

### Landmarken

In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:

1. Kopfbereich (banner), ohne Namen
  2. Navigation (navigation), Name „Hauptnavigation" — liegt innerhalb einer anderen Landmarke
3. Hauptbereich (main), ohne Namen
  4. Navigation (navigation), Name „Nutzerverwaltung" — liegt innerhalb einer anderen Landmarke
  5. Bereich (region), Name „Stammdaten" — liegt innerhalb einer anderen Landmarke
  6. Bereich (region), Name „Passwort zurücksetzen" — liegt innerhalb einer anderen Landmarke

### Ueberschriften

- Stufe 1: „Konto bearbeiten"
- Stufe 2: „Stammdaten"
- Stufe 2: „Passwort zurücksetzen"

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
3. „Importe" — Link, im navigation „Hauptnavigation"
4. „Zuordnungen" — Link, im navigation „Hauptnavigation"
5. „Format-Review 9 offene Aufgaben" — Link, im navigation „Hauptnavigation"
6. „Design wechseln" — Schaltflaeche, im banner
7. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
8. „Nutzerverwaltung" — Link, im navigation „Nutzerverwaltung"
9. „Name" — Eingabefeld, im region „Stammdaten"
10. „Institution" — Auswahlfeld, im region „Stammdaten"
11. „Speichern" — Schaltflaeche, im region „Stammdaten"
12. „Stattdessen ein eigenes Passwort setzen" — Kontrollkaestchen, im region „Passwort zurücksetzen"
13. „Passwort zurücksetzen" — Schaltflaeche, im region „Passwort zurücksetzen"

#### Schmales Fenster (800 Pixel)

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Navigation aufklappen" — Schaltflaeche, im banner. aufklappbar, derzeit zu
4. „Design wechseln" — Schaltflaeche, im banner
5. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
6. „Nutzerverwaltung" — Link, im navigation „Nutzerverwaltung"
7. „Name" — Eingabefeld, im region „Stammdaten"
8. „Institution" — Auswahlfeld, im region „Stammdaten"
9. „Speichern" — Schaltflaeche, im region „Stammdaten"
10. „Stattdessen ein eigenes Passwort setzen" — Kontrollkaestchen, im region „Passwort zurücksetzen"
11. „Passwort zurücksetzen" — Schaltflaeche, im region „Passwort zurücksetzen"

### Formularfelder

- „E-Mail" — Eingabefeld, Typ email, kein Pflichtfeld, gesperrt.
  Beschriftung kommt aus: label.
  Verknuepfter Hinweis (aria-describedby, Kennung u-email-note): „Die E-Mail-Adresse ist die Anmeldung und lässt sich nicht ändern.".
- „Name" — Eingabefeld, Typ text, Pflichtfeld.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „Institution" — Auswahlfeld, Typ select, kein Pflichtfeld.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „Administrator" — Kontrollkaestchen, kein Pflichtfeld, gesperrt.
  Beschriftung kommt aus: umgebendes label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „Aktiv (Anmeldung erlaubt)" — Kontrollkaestchen, kein Pflichtfeld, gesperrt.
  Beschriftung kommt aus: umgebendes label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „Stattdessen ein eigenes Passwort setzen" — Kontrollkaestchen, kein Pflichtfeld.
  Beschriftung kommt aus: umgebendes label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.

### Tabellen

Keine Tabellen.

### Live-Bereiche

Das wird angesagt, ohne dass die Seite wechselt:

- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.
- Meldungsbereich (alert), Ansageart assertive.
  Aktueller Inhalt: leer, meldet also gerade nichts.
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

Gemessen in einem Fenster von 1500 mal 1100 Pixeln. Die Seite ist 1100 Pixel hoch und passt damit ohne Scrollen. Der Kopfbereich liegt am oberen Rand ueber die volle Breite und ist 63 Pixel hoch. Die Navigation „Hauptnavigation" sitzt innerhalb der Kopfzeile, oben links. Der Hauptbereich beginnt 85 Pixel unter dem Seitenanfang und ist 640 Pixel breit; er ist mittig gesetzt und laesst links und rechts je rund 430 Pixel frei. Der Bereich „Stammdaten" liegt auf halber Hoehe mittig und ist 604 Pixel breit. Der Bereich „Passwort zurücksetzen" liegt unten mittig und ist 604 Pixel breit. Oben rechts stehen, von links nach rechts: „Design wechseln" (Schaltflaeche), „Benutzermenü: Administrator" (Schaltflaeche). Oben links stehen: „Zum Inhalt springen", „Zur Startseite", „Importe", „Zuordnungen", „Format-Review 9 offene Aufgaben". Die breiten Schaltflaechen im Inhalt sind „Speichern" (auf halber Hoehe mittig), „Passwort zurücksetzen" (unten mittig).

Der Bildschirmabzug `15-nutzer-detail.png` im selben Verzeichnis zeigt denselben Stand fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.

