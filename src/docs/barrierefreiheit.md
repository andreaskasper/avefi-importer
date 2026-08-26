# Barrierefreiheit pruefen

Die Oberflaeche muss ohne Maus und mit einem Vorlesewerkzeug bedienbar sein.
Zwei Dinge sichern das ab: eine maschinelle Pruefung, die sich wiederholen
laesst, und ein Durchgang von Hand, den die Maschine nicht ersetzen kann.

## 1. Maschinelle Pruefung

`tests/a11y/axe.mjs` faehrt die Kernseiten mit einem echten Browser an, meldet
sich an und laesst auf jedem Stand [axe-core](https://github.com/dequelabs/axe-core)
laufen — gegen `wcag2a`, `wcag2aa`, `wcag21a` und `wcag21aa`.

Geprueft wird nicht nur der Ruhezustand. Zusaetzlich werden die Zustaende
geoeffnet, in denen die Fehler sitzen: Nutzermenue, Zeilenmenue, Rueckfrage,
aufgeklappte Zuordnungszeile, Zielliste der Combobox, Konverterauswahl und die
Reiter des Schema-Editors. Jede Seite laeuft in beiden Farbschemata, weil sich
Kontrastfehler nur in einem von beiden zeigen koennen.

Die Kennungen von Import, Profil, Datensatz und Format-Review liest das Skript
aus der laufenden Anwendung. Es muss also nicht angepasst werden, wenn ein
Testimport wegfaellt.

### Aufruf

```bash
docker run --rm --network host \
  -v /var/www/avefi-importer/src:/app -w /app \
  -e A11Y_BASE=https://avefiimporter.goo1.de \
  -e A11Y_USER=admin@av-efi.net -e A11Y_PASS=changeme \
  mcr.microsoft.com/playwright:v1.50.0-noble node tests/a11y/axe.mjs
```

Voraussetzung sind die Entwicklungsabhaengigkeiten `axe-core` und
`playwright-core` (`npm install`). Der Browser kommt aus dem Abbild;
`playwright-core` ist deshalb auf `1.50.0` festgenagelt — eine andere Fassung
sucht eine Chromium-Ausgabe, die im Abbild nicht liegt.

Stellschrauben:

| Umgebungsvariable | Vorgabe | Wirkung |
| --- | --- | --- |
| `A11Y_BASE` | `http://localhost:3000` | Adresse der Anwendung. Ueber HTTPS aufrufen, sonst greift das Sitzungscookie nicht. |
| `A11Y_USER` / `A11Y_PASS` | `admin@av-efi.net` / `changeme` | Anmeldung. |
| `A11Y_THEMES` | `light,dark` | Farbschemata, die geprueft werden. |

### Ergebnis

Je Stand eine Zeile mit der Zahl der Befunde nach Schwere, darunter jeder
Befund mit Regel, WCAG-Kriterium und den betroffenen Stellen. Das Skript endet
mit 1, sobald irgendwo ein Befund der Schwere `serious` oder `critical` steht —
so faellt es in einer Pipeline auf. `moderate` und `minor` werden gemeldet,
lassen den Durchlauf aber gruen.

## 2. Durchgang von Hand

axe-core findet fehlende Beschriftungen und schlechte Kontraste. Es findet
nicht, ob man ans Ziel kommt. Der folgende Ablauf ist der vertraglich zugesagte
Kernweg und wird **ausschliesslich mit der Tastatur** gegangen — Maus weglegen:

1. Anmelden. Der erste Tabstopp muss die Sprungmarke „Zum Inhalt springen"
   sein.
2. Datei hochladen: bis zum Dateifeld tabben, mit Leertaste oder Eingabetaste
   oeffnen, Datei waehlen. Erwartung: Der Stand wird angesagt, nicht nur
   angezeigt.
3. Ueber die Zeilenaktion in die Zuordnung springen.
4. Mindestens eine Feldzuordnung aendern: Zielvorschlag uebernehmen, dann im
   Zielfeld tippen, mit Pfeiltasten waehlen, mit Eingabetaste uebernehmen.
5. Vokabularzuordnung pruefen: „Werteliste anlegen", dann in der Tabelle je
   Quellwert einen AVefi-Wert waehlen.
6. „Gegen das AVefi-Schema pruefen".
7. Speichern, offene Spalten ignorieren, „Speichern und konvertieren".
8. Mappingprofil und AVefi-JSON herunterladen.

Worauf dabei zu achten ist:

- **Der Fokus muss sichtbar sein**, auf jedem Schritt. Kein `outline:none` ohne
  Ersatz.
- **Der Fokus darf nicht verlorengehen.** Verschwindet der gedrueckte Knopf —
  weil er gesperrt wird oder aus dem Baum faellt —, faellt der Fokus sonst auf
  `<body>`, und der Weg zurueck beginnt am Seitenanfang. Dagegen stehen
  `useKeepFocus()` und das Nachfuehren in Editor, Verzweigung und Kette.
- **Dialoge**: Escape schliesst, der Fokus kehrt an die ausloesende Stelle
  zurueck, und dazwischen kommt man nicht aus dem Dialog heraus.
- **Menues**: Pfeiltasten wandern, Pos1/Ende springen, Escape schliesst und
  gibt den Fokus zurueck.
- **Zustandsaenderungen ohne Seitenwechsel** muessen in einem `aria-live`- oder
  `role="status"`-Bereich stehen, sonst bleiben sie stumm.

## 3. Kontraste

Beide Farbschemata muessen WCAG AA erfuellen: 4,5:1 fuer Text, 3:1 fuer grosse
Schrift und Bedienelemente. Die Farbwerte stehen ausschliesslich in
`app/assets/css/app.css` als Variablen; geaendert wird dort und nirgends sonst.

Zwei Fallen, die hier schon zugeschlagen haben:

- **Deckkraft senkt den Kontrast.** `opacity` auf einer Tabellenzeile zieht
  jeden Text darin mit nach unten. Ignorierte Zeilen werden deshalb ueber
  `--row-ignored` eingefaerbt, nicht abgeblendet.
- **Weisse Schrift auf einer hellen Flaeche.** Im dunklen Schema ist
  `--primary` hell; weisser Text darauf kommt auf 2,7:1. Dafuer gibt es
  `--on-primary` und `--on-danger`, die im dunklen Schema auf Dunkel umstellen.
