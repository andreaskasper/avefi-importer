# Die Oberflaeche in Worten

Diese Sammlung beschreibt jede Seite des AVefi Importers so, dass man sie ohne Bildschirm erfassen kann. Je Seite gibt es zwei Teile: zuerst, was ein Vorlesewerkzeug vorfindet — Landmarken, Ueberschriften, Tab-Reihenfolge, Formularfelder, Tabellen, Live-Bereiche, Bilder — und danach ein kurzer Absatz zur raeumlichen Anordnung, damit „der Knopf oben rechts" in einer Besprechung eindeutig ist.

Die Beschreibungen sind aus der laufenden Anwendung ausgelesen, nicht aus dem Quelltext abgeschrieben. Was hier steht, ist also der Stand, den ein Browser tatsaechlich aufbaut.

**Stand:** 2026-09-07, Commit `25f9af7`. Erzeugt gegen `https://avefiimporter.goo1.de`, gemessen in einem Fenster von 1500 mal 1100 Pixeln.

Zu jeder Beschreibung liegt ein Bildschirmabzug mit demselben Dateinamen und der Endung `.png` im selben Verzeichnis. Der ist nicht Teil der Beschreibung, sondern dafuer da, dass Sehende in einer Runde denselben Stand vor Augen haben.

## Die Seiten

- [Anmeldung](01-anmeldung.md) — `/login`. Der Einstieg. Ohne Kopfzeile und ohne Navigation.
- [Importliste](02-importliste.md) — `/`. Die Startseite nach der Anmeldung. Liste aller Importe und der Weg, eine neue Datei hochzuladen.
- [Importdetails](03-importdetails.md) — `/imports/52f6f7f6-72e5-4d45-ba29-48e16ab16806`. Ein einzelner Import mit seinem Stand und den Wegen weiter zu Zuordnung, Datensaetzen und Bericht.
- [Pruefbericht](04-pruefbericht.md) — `/imports/52f6f7f6-72e5-4d45-ba29-48e16ab16806/report`. Was die Pruefung eines Imports ergeben hat.
- [Mapping-Editor](05-mapping-editor.md) — `/imports/52f6f7f6-72e5-4d45-ba29-48e16ab16806/mapping`. Die wichtigste Seite. Hier wird jede Spalte der Quelldatei einem AVefi-Feld zugeordnet. Die Seite ist die komplexeste der Anwendung; hier verbringt ein Tester die meiste Zeit.
- [Datensatzliste](06-datensatzliste.md) — `/imports/52f6f7f6-72e5-4d45-ba29-48e16ab16806/records`. Die aus einem Import entstandenen Datensaetze als Liste.
- [Datensatz im Einzelnen](07-datensatz-detail.md) — `/imports/52f6f7f6-72e5-4d45-ba29-48e16ab16806/records/21471`. Ein einzelner Datensatz mit Werk, Manifestationen und Exemplaren.
- [Zuordnungsliste](08-zuordnungsliste.md) — `/mappings`. Alle gespeicherten Mappingprofile.
- [Profil-Detail](09-profil-detail.md) — `/mappings/8`. Ein Mappingprofil zum Ansehen.
- [Profil-Editor](10-profil-editor.md) — `/mappings/8/edit`. Ein Mappingprofil zum Bearbeiten.
- [Schema-Editor](11-schema-editor.md) — `/mappings/new`. Ein neues Mappingprofil gegen das AVefi-Schema anlegen.
- [Normdaten zuordnen](17-normdaten.md) — `/mappings/8/normdaten`. Alle Werte eines Profils, zu denen Normdaten gesucht werden, als Arbeitsliste.
- [Formatpruefung](12-formatpruefung.md) — `/reviews`. Die Liste der offenen und erledigten Formatpruefungen.
- [Formatpruefung im Einzelnen](13-formatpruefung-detail.md) — `/reviews/5`. Eine einzelne Formatpruefung.
- [Nutzerverwaltung](14-nutzerverwaltung.md) — `/users`. Alle Konten der Anwendung.
- [Nutzer im Einzelnen](15-nutzer-detail.md) — `/users/1`. Ein einzelnes Konto zum Bearbeiten.
- [Eigenes Profil](16-eigenes-profil.md) — `/profile`. Das eigene Konto: Name, Sprache, Passwort.

## Wie die Rollen benannt sind

Damit die Beschreibungen ohne Fachbegriffe lesbar bleiben, werden die ARIA-Rollen deutsch benannt. Die Zuordnung:

- `banner` — Kopfbereich
- `navigation` — Navigation
- `main` — Hauptbereich
- `contentinfo` — Fussbereich
- `complementary` — Nebenbereich
- `region` — Bereich
- `button` — Schaltflaeche
- `link` — Link
- `textbox` — Eingabefeld
- `combobox` — Auswahlfeld
- `checkbox` — Kontrollkaestchen
- `heading` — Ueberschrift
- `tab` — Reiter
- `menuitem` — Menueeintrag
- `status` — Statusbereich
- `alert` — Meldungsbereich
- `dialog` — Dialog

## Wie das erneuert wird

Wenn sich die Oberflaeche aendert, wird `tests/a11y/oberflaeche.mjs` erneut ausgefuehrt; der Aufruf steht in `docs/barrierefreiheit.md`. Alle Dateien in diesem Verzeichnis werden dabei neu geschrieben. Von Hand geaenderte Stellen gehen dabei verloren — Anmerkungen gehoeren deshalb nicht hierher, sondern in die Fehlerliste.

