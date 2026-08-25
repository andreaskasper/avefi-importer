# Oberflaeche von Hand pruefen

Die 332 automatischen Tests decken Mappinglogik, Konverter, Profile und
Normdaten ab, aber keine Vue-Komponenten. Die Oberflaeche wird deshalb von Hand
geprueft. Diese Liste ist der Durchgang, der vor einer Uebergabe gemacht werden
sollte; sie ist so geschrieben, dass jemand ohne Vorkenntnis sie abarbeiten
kann.

Vorbereitung: Dienste laufen (`docker compose -f docker-compose.dev.yml ps`,
alle `Up`, `db` und `efi-conv` `healthy`), ein Konto besteht (siehe
`deployment.md`), eine CSV mit Kopfzeile und einigen Zeilen liegt bereit.

## 1. Anmeldung

1. `/imports/irgendwas` ohne Sitzung aufrufen. Erwartung: Umleitung nach
   `/login?next=…`, nach der Anmeldung landet man auf der urspruenglich
   gewuenschten Seite.
2. Falsches Passwort. Erwartung: eine Fehlermeldung, die nicht verraet, ob es
   die Adresse gibt.
3. Nach der Anmeldung Kopfzeilen pruefen:
   ```bash
   curl -sI https://<host>/ | grep -i cache
   ```
   Erwartung: `cache-control: no-store, private, max-age=0, must-revalidate`.
   Fehlt das, kann ein vorgelagerter Zwischenspeicher eine angemeldete Seite an
   Unbeteiligte ausliefern — genau das ist schon vorgekommen.
4. Sprache umschalten (Deutsch/Englisch). Erwartung: Die Oberflaeche wechselt,
   und das `lang`-Attribut des Dokuments wechselt mit. Steht es fest auf `de`,
   liest ein Screenreader die englische Fassung mit deutscher Aussprache vor.

## 2. Upload

1. Eine CSV per Ziehen und Ablegen hochladen. Erwartung: Fortschritt sichtbar,
   danach Status `queued`, kurz darauf `converting` oder eine Rueckfrage.
2. Die Liste aktualisiert sich von selbst, solange etwas laeuft, und hoert damit
   auf, wenn nichts mehr offen ist.
3. Upload ueber eine Adresse. Erwartung: Der Abruf laeuft im Hintergrund; die
   Liste zeigt sofort einen Eintrag. Bei einer unerreichbaren Adresse geht der
   Import nach `error` und der Grund steht dabei — er bleibt nicht in
   `converting` haengen.
4. Eine `.xls`- oder `.ods`-Datei hochladen. Erwartung: eine Meldung im
   Klartext, was zu tun ist („in Excel oder LibreOffice als .xlsx speichern"),
   kein stiller Fehlschlag.
5. Eine kaputte JSON-Datei hochladen. Erwartung: `error` mit einer Meldung, die
   die Stelle nennt, nicht „Das hat nicht geklappt".

## 3. Arbeitsmappe mit mehreren Blaettern

1. Eine XLSX mit mehreren Blaettern hochladen. Erwartung: Status
   `awaiting_sheet_choice`, die Seite `/imports/:id/sheets` listet die Blaetter
   mit Zeilen- und Spaltenzahl.
2. Deckblaetter und Legenden sind nicht vorausgewaehlt; vorausgewaehlt ist, was
   mindestens zwei Spalten und mindestens eine Datenzeile hat.
3. Zwei Blaetter waehlen. Erwartung: Es entstehen zwei eigene Importe, weil zwei
   Blaetter mit unterschiedlichen Kopfzeilen unterschiedliche Zuordnungen
   brauchen.

## 4. Mapping-Editor

Das ist der Teil mit den meisten beweglichen Stellen; hier lohnt Sorgfalt.

1. Eine Datei mit unbekannter Kopfzeile hochladen. Erwartung: Status
   `awaiting_format_review` beziehungsweise der Hinweis, dass eine Zuordnung
   noetig ist.
2. Editor oeffnen. Erwartung: Alle Spalten stehen da, jede mit ihrem Zustand —
   gemappt, ignoriert, noch nicht angefasst. Die noch offenen sind gesondert
   sichtbar.
3. Eine Spalte auf ein Ziel legen. Erwartung: Die Vorschau zeigt sofort echte
   Werte aus der Datei, nicht Platzhalter.
4. Eine Kette bauen, die eine Liste erzeugt (`split`), und sie auf ein
   einwertiges Ziel legen. Erwartung: Der Editor beanstandet das, **bevor**
   gespeichert wird, und schlaegt `take` oder `join` vor. Das Speichern ist
   blockiert, nicht nur gewarnt.
5. Eine Spalte auf zwei Ziele legen. Erwartung: Die gemeinsame Vorkette laeuft
   einmal, danach zwei getrennte Nachketten; der Ergebnisbaum zeigt beide.
6. Vokabularansicht oeffnen. Erwartung: Die verschiedenen Werte der Spalte mit
   ihrer Haeufigkeit; nicht zugeordnete Werte sind erkennbar.
7. Speichern, ohne alle Spalten entschieden zu haben. Erwartung: Das Profil ist
   speicherbar, gilt aber nicht als vollstaendig.
8. Alle Spalten entscheiden. Erwartung: Das Profil gilt als vollstaendig.
9. Speichern und konvertieren lassen. Erwartung: Der Import geht auf
   `converted`, die Datensatzzahl stimmt mit der Zeilenzahl ueberein (bei
   eingeschalteter Zusammenfassung entsprechend weniger).
10. Profil exportieren und wieder einlesen. Erwartung: Die Datei enthaelt eine
    Stichprobe, und das eingelesene Profil laesst sich sofort bearbeiten. Ohne
    Stichprobe verweigert der Editor den Dienst — dann Beispieldaten
    nachreichen.
11. Ein fremdes Dokument als Profil einlesen. Erwartung: Abweisung mit
    Begruendung.

## 5. Fassungen

1. Ein Profil zweimal aendern und speichern. Erwartung: zwei Fassungen im
   Verlauf.
2. Eine fruehere Fassung wiederherstellen. Erwartung: Der bisherige Stand geht
   nicht verloren, sondern wird selbst als Fassung abgelegt.
3. Umbenennen. Erwartung: keine neue Fassung.
4. Ein Profil aendern, das ein bereits konvertierter Import benutzt hat.
   Erwartung: Der Import bleibt, wie er ist. Er merkt sich Profil und Fassung,
   mit denen er entstanden ist.

## 6. Datensaetze und Pruefbericht

1. Datensatzliste oeffnen, nach einem Titel suchen. Erwartung: Gesucht und
   geblaettert wird auf dem Server; die Suche findet auch, was nicht auf der
   ersten Seite steht.
2. Pruefbericht oeffnen. Erwartung: Beanstandungen mit Schweregrad, Zeile,
   Quellfeld und AVefi-Feld — nicht nur eine Gesamtzahl.
3. Einen Datensatz bearbeiten und speichern. Erwartung: Die Live-Pruefung
   meldet, wenn ein Wert nicht zum Schema passt; der Satz ist danach als
   bearbeitet gekennzeichnet.
4. Neu konvertieren. Erwartung: eine Rueckfrage, die sagt, wie viele
   handbearbeitete Datensaetze dabei verloren gehen.
5. `avefi.v1.json` herunterladen. Erwartung: eine Datei groesser als null Byte,
   deren Datensatzzahl zur Anzeige passt.

## 7. Pruefung gegen efi-conv

Der Nachweis, dass wirklich `efi-conv` prueft und nichts nachgebaut ist:

```bash
# Welches Schema ist im Sidecar eingefroren?
docker compose -f docker-compose.dev.yml exec efi-conv \
  python -c "import urllib.request,json;print(json.load(urllib.request.urlopen('http://127.0.0.1:8000/health')))"
```

Erwartung: Quelle, Datei, Version und eine Pruefsumme des Schemas. Dieselbe
Angabe steht im Pruefbericht jedes Imports.

Die echte Kommandozeile auf einem erzeugten Ergebnis:

```bash
docker compose -f docker-compose.dev.yml exec -T web node -e "
const fs=require('fs');
const nodes=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
fetch('http://efi-conv:8000/check-cli',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({records:nodes})}).then(r=>r.json()).then(j=>{
  console.log('Rueckgabewert', j.exitCode); console.log(j.stderr);});
" /mnt/files/<import-uuid>/avefi.v1.json
```

Erwartung bei einer sauberen Datei: Rueckgabewert 0 und
`All N records passed the checks successfully`.

Beide Wege sollten zum selben Urteil kommen. `/check` sammelt alle Befunde,
`/check-cli` bricht nach der Art der Kommandozeile ab; wo `/check-cli` mehr
meldet, sind es in aller Regel Folgefehler eines Befundes, den `/check` schon
genannt hat (siehe „Doppelte Signaturen" in der README).

## 8. Formatpruefung

1. Zwanzig Dateien mit derselben unbekannten Kopfzeile hochladen. Erwartung:
   **eine** Aufgabe, nicht zwanzig. Das Abzeichen in der Kopfzeile zaehlt
   Aufgaben, nicht Zeilen.
2. Einen Konverter zuordnen. Erwartung: Die Entscheidung gilt der Kopfzeile;
   alle wartenden Importe mit dieser Kopfzeile laufen weiter.
3. Ein Format ablehnen. Erwartung: Der Import geht auf `error`, die Datei bleibt
   herunterladbar.

## 9. Nutzerverwaltung

1. Konto ohne Passwort anlegen. Erwartung: Ein Einmalpasswort erscheint genau
   einmal in der Antwort; es gibt keinen Mailversand, ueber den es sonst ankaeme.
   Beim erneuten Aufruf der Seite ist es nicht mehr sichtbar.
2. Das eigene Konto sperren oder entmachten wollen. Erwartung: geht nicht.
3. Ein Konto loeschen, das Importe angelegt hat. Erwartung: Die Importe bleiben.
4. Eigenes Passwort aendern. Erwartung: Das alte wird verlangt.

## 10. Trennung der Institutionen

Mit zwei Konten aus verschiedenen Haeusern anmelden und pruefen, dass keines die
Importe des anderen sieht — weder in der Liste noch ueber einen direkt
aufgerufenen Pfad `/imports/<fremde-uuid>`.

Erwartung: **404**, nicht 403. Der Unterschied ist beabsichtigt: Ein 403 wuerde
bestaetigen, dass es diesen Import gibt. Ein Konto ohne Institution
(`institution_id` leer) kommt an keine Importe. Administratorinnen sehen
haeuseruebergreifend — wer das nicht will, prueft mit zwei gewoehnlichen Konten.

## 11. Worker

```bash
docker logs --tail 40 avefi_worker
```

Erwartung: regelmaessige Meldungen, alle zehn Minuten ein geordnetes
`Hoechstlaufzeit erreicht, beende` mit anschliessendem Neustart. Bleibt ein
Import in `converting` stehen, gehoert das Worker-Log dazu; ein fehlgeschlagener
Auftrag setzt den Import auf `error`, damit die Oberflaeche keinen Fortschritt
anzeigt, den es nicht gibt.
