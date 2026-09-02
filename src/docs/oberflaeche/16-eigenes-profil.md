# Eigenes Profil

Adresse: `/profile`  
Seitentitel im Browser: „Mein Nutzerprofil · AVefi Importer"  
Sprache des Dokuments: `de`

Das eigene Konto: Name, Sprache, Passwort.

## Teil 1 — Was der Screenreader vorfindet

### Landmarken

In Dokumentreihenfolge, also so, wie sie beim Wandern ueber die Bereiche kommen:

1. Kopfbereich (banner), ohne Namen
  2. Navigation (navigation), Name „Hauptnavigation" — liegt innerhalb einer anderen Landmarke
3. Hauptbereich (main), ohne Namen
  4. Navigation (navigation), Name „Mein Nutzerprofil" — liegt innerhalb einer anderen Landmarke
  5. Bereich (region), Name „Anzeigename" — liegt innerhalb einer anderen Landmarke
  6. Bereich (region), Name „Passwort ändern" — liegt innerhalb einer anderen Landmarke

### Ueberschriften

- Stufe 1: „Mein Nutzerprofil"
- Stufe 2: „Anzeigename"
- Stufe 2: „Passwort ändern"

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
4. „Zuordnungsprofile" — Link, im navigation „Hauptnavigation"
5. „Format-Review 9 offene Aufgaben" — Link, im navigation „Hauptnavigation"
6. „Design wechseln" — Schaltflaeche, im banner
7. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
8. „Importe" — Link, im navigation „Mein Nutzerprofil"
9. „Anzeigename" — Eingabefeld, im region „Anzeigename"
10. „Namen speichern" — Schaltflaeche, im region „Anzeigename"
11. „Aktuelles Passwort" — Passwortfeld, im region „Passwort ändern"
12. „Neues Passwort" — Passwortfeld, im region „Passwort ändern". Hinweis: „Mindestens 12 Zeichen."
13. „Neues Passwort bestätigen" — Passwortfeld, im region „Passwort ändern"
14. „Passwort ändern" — Schaltflaeche, im region „Passwort ändern"

#### Schmales Fenster (800 Pixel)

1. „Zum Inhalt springen" — Link
2. „Zur Startseite" — Link, im banner
3. „Navigation aufklappen" — Schaltflaeche, im banner. aufklappbar, derzeit zu
4. „Design wechseln" — Schaltflaeche, im banner
5. „Benutzermenü: Administrator" — Schaltflaeche, im banner. aufklappbar, derzeit zu; oeffnet ein Menue
6. „Importe" — Link, im navigation „Mein Nutzerprofil"
7. „Anzeigename" — Eingabefeld, im region „Anzeigename"
8. „Namen speichern" — Schaltflaeche, im region „Anzeigename"
9. „Aktuelles Passwort" — Passwortfeld, im region „Passwort ändern"
10. „Neues Passwort" — Passwortfeld, im region „Passwort ändern". Hinweis: „Mindestens 12 Zeichen."
11. „Neues Passwort bestätigen" — Passwortfeld, im region „Passwort ändern"
12. „Passwort ändern" — Schaltflaeche, im region „Passwort ändern"

### Formularfelder

- „Anzeigename" — Eingabefeld, Typ text, Pflichtfeld, autocomplete name.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „E-Mail" — Eingabefeld, Typ email, kein Pflichtfeld, gesperrt.
  Beschriftung kommt aus: label.
  Verknuepfter Hinweis (aria-describedby, Kennung pf-email-note): „Die E-Mail-Adresse ist die Anmeldung. Ändern kann sie nur eine Administratorin.".
- „Aktuelles Passwort" — Passwortfeld, Typ password, Pflichtfeld, autocomplete current-password.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.
- „Neues Passwort" — Passwortfeld, Typ password, Pflichtfeld, autocomplete new-password.
  Beschriftung kommt aus: label.
  Verknuepfter Hinweis (aria-describedby, Kennung pf-new-hint): „Mindestens 12 Zeichen.".
- „Neues Passwort bestätigen" — Passwortfeld, Typ password, Pflichtfeld, autocomplete new-password.
  Beschriftung kommt aus: label.
  Kein verknuepfter Hinweis und keine verknuepfte Fehlermeldung.

### Tabellen

Keine Tabellen.

### Live-Bereiche

Das wird angesagt, ohne dass die Seite wechselt:

- Statusbereich (status), Ansageart polite.
  Aktueller Inhalt: leer, meldet also gerade nichts.
- Meldungsbereich (alert), Ansageart assertive.
  Aktueller Inhalt: leer, meldet also gerade nichts.
- Statusbereich (status), Ansageart polite.
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

Gemessen in einem Fenster von 1500 mal 1100 Pixeln. Die Seite ist 1100 Pixel hoch und passt damit ohne Scrollen. Der Kopfbereich liegt am oberen Rand ueber die volle Breite und ist 63 Pixel hoch. Die Navigation „Hauptnavigation" sitzt innerhalb der Kopfzeile, oben links. Der Hauptbereich beginnt 85 Pixel unter dem Seitenanfang und ist 640 Pixel breit; er ist mittig gesetzt und laesst links und rechts je rund 430 Pixel frei. Der Bereich „Anzeigename" liegt oben mittig und ist 604 Pixel breit. Der Bereich „Passwort ändern" liegt auf halber Hoehe mittig und ist 604 Pixel breit. Oben rechts stehen, von links nach rechts: „Design wechseln" (Schaltflaeche), „Benutzermenü: Administrator" (Schaltflaeche). Oben links stehen: „Zum Inhalt springen", „Zur Startseite", „Importe", „Zuordnungsprofile", „Format-Review 9 offene Aufgaben". Die breiten Schaltflaechen im Inhalt sind „Namen speichern" (auf halber Hoehe mittig), „Passwort ändern" (unten mittig).

Der Bildschirmabzug `16-eigenes-profil.png` im selben Verzeichnis zeigt denselben Stand fuer alle, die in einer Besprechung auf denselben Bildschirm schauen wollen.

