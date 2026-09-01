# Änderungsprotokoll

AVefi Importer, Leistungspaket B des Werkvertrags mit der TIB Hannover.

## Wozu dieses Protokoll da ist

Nicht als Liste von Änderungen, sondern als **Nachweis, dass jede Rückmeldung
angekommen ist**. Die Leistungsbeschreibung verlangt eine „Dokumentation
bekannter Einschränkungen und getroffener Annahmen" und dass Abweichungen
gegenüber den Vorgaben benannt werden. Beides steht hier.

Deshalb ist nach **Rückmelderunden** gegliedert und nicht nach Commits, und
deshalb nennt jeder Eintrag, **wer** etwas gemeldet hat. Wer wissen will, was
aus seinem Hinweis geworden ist, findet ihn unter seinem Namen.

Aufbau eines Eintrags:

> **Was gemeldet wurde** — von wem, wann.
> Was die Ursache war, was daraus wurde, welcher Commit, und — wo einschlägig —
> welches Abnahmekriterium betroffen ist.

Einträge, die nicht auf eine Meldung zurückgehen, stehen unter „Aus eigenem
Antrieb". Was offen blieb, steht unter „Offen geblieben" — auch dann, wenn es
unangenehm ist.

Zeitzone durchgängig Europe/Berlin. Commits verweisen auf
`github.com/andreaskasper/avefi-importer`.

---

## 2026-09-01 — Stefan Stretz und Luca Wollny, zweite Testrunde

Commit `2719a43`. Live auf `https://avefiimporter.goo1.de`.

### Fünf Meldungen, ein Fehler: Dialoge blieben unsichtbar

**Gemeldet von Luca Wollny (11:38) und Stefan Stretz (09:25).** Luca: „Löschen"
und „Neu konvertieren" in der Importe-Übersicht tun nichts, die Seite dunkelt
ab; dasselbe bei „Zuordnen" in der Profilliste und in der Zuordnungsvorschau.
Stefan: Nach dem Anlegen eines Nutzers bleibt die Oberfläche in einem
abgedunkelten Overlay hängen, ohne sichtbaren Dialog.

Ursache war eine Namenskollision, kein Bedienfehler und keine fünf Fehler.
`.modal-box` war zweimal vergeben — einmal von uns, einmal von daisyUI 5. Die
eigene Regel setzte Breite, Hintergrund und Rahmen und sagte zu `opacity`
nichts; daisyUIs Regel setzt `opacity: 0` und hebt das nur unter einem Element
mit `.modal.modal-open` wieder auf. Die Dialoge hingen unter `.modal-overlay`,
einer eigenen Klasse. Also wurde der Overlay gezeichnet und die Box blieb
unsichtbar.

Zwölf Klassennamen waren doppelt vergeben: `alert`, `avatar`, `badge`, `btn`,
`btn-xs`, `card`, `disabled`, `divider`, `input`, `menu`, `modal-box`, `step`.
Neun anwendungseigene Familien (26 Klassen, 227 Stellen in 43 Dateien) tragen
jetzt das Präfix `ui-`; `btn`, `badge` und `disabled` bleiben daisyUI und werden
von uns nur ergänzt. `tests/frontend/klassennamen.test.ts` schneidet beide
Namensmengen und lässt den Testlauf fehlschlagen, sobald eine eigene Klasse
wieder einen daisyUI-Namen trägt — die drei Ausnahmen stehen dort namentlich,
jede mit dem Satz, was genau ergänzt wird. Der Test prüft zusätzlich, dass keine
Ausnahme überflüssig geworden ist.

*Abnahmebezug: Anlage „Integration und Kompatibilität" — „Globale CSS-Regeln,
ein separates Theme-System und fest verdrahtete Layoutannahmen, die mit dem
AVefi-Frontend kollidieren, sind vermieden."*

### Die Barrierefreiheitsprüfung wertete nicht aus, was sie nicht beurteilen konnte

**Gemeldet von Stefan Stretz.** Kontrastprobleme an dunkelblauen
Primärknöpfen im hellen Schema, mit der Frage: „Der aktuelle axe-Test scheint
solche Fälle noch nicht vollständig abzudecken?"

Die Frage traf. `tests/a11y/axe.mjs` las ausschließlich `ergebnis.violations`.
`ergebnis.incomplete` — axe-cores dritter Ausgang, „nicht beurteilbar" — wertete
niemand aus. axe gibt beim Kontrast genau dann auf, wenn hinter dem Text ein
Hintergrundbild liegt, und daisyUI legt auf jeden Knopf eines. Allein auf der
Startseite fielen dadurch **171 Stellen** aus der Wertung, darunter sämtliche
Primärknöpfe.

Damit war die Aussage aus der Mail vom 31.08. — „75 Stände in beiden
Farbschemata mit axe-core erneut geprüft, kein Befund ab serious" — eine Aussage
über die Reichweite des Werkzeugs und nicht über die Oberfläche. Das ist in der
Antwort vom 01.09. ausdrücklich richtiggestellt worden.

Die Prüfung misst offene Kontraste jetzt aus den gerenderten Bildpunkten nach:
Element abfotografieren, häufigste Farbe als Grund, häufigste deutlich
abweichende als Schrift, alles unter 4,5:1 als Fehler. Gleichartige Elemente
werden einmal gemessen. Die Zahl der nicht beurteilten Fälle steht jetzt in
jedem Protokoll, auch für die übrigen Regeln.

### Und dann war der gemeldete Befund doch richtig

In der ersten Antwort an die Runde stand, die Nachmessung ergebe **5,48:1** und
der Befund lasse sich nicht nachstellen. **Das war falsch.**

Die Nachmessung riet die Schriftfarbe aus dem Bild: häufigste Farbe gleich
Hintergrund, häufigste deutlich abweichende gleich Schrift. Bei einem Knopf mit
abgerundeten Ecken sind die Eckpunkte aber der Seitenhintergrund und nicht die
Schrift. Das Verfahren hielt das Weiß der Ecken für die Schrift und gab
Entwarnung.

Mit der Schriftfarbe aus dem Stylesheet gemessen:

| Schema | Schrift auf Grund | Verhältnis |
|---|---|---|
| hell | `#16232a` auf `#43667a` | **2,61:1** |
| dunkel | `#e4ebee` auf `#88a9b9` | **2,07:1** |

Beides fällt unter WCAG 2.2 AA durch.

**Die Ursache ist dieselbe wie bei den Dialogen, nur an einer anderen
Eigenschaft.** In `app.css` stand `a { color: inherit }` **ungeschichtet**;
daisyUIs `.btn { color: var(--btn-fg) }` liegt in `@layer utilities`. Und
ungeschichtetes CSS schlägt geschichtetes unabhängig von der Spezifität. Auf dem
Element stand `--btn-fg` korrekt auf `#ffffff` und wurde nie benutzt. Die Regel
gilt jetzt als `a:not(.btn)`: hell 5,48:1, dunkel 6,96:1.

Das erklärt, warum Stefans Liste ausgerechnet „Edit", „Map", „Start mapping" und
„Assign" nannte: Das sind **Links**, die wie Knöpfe aussehen. Die echten
`<button>` — „Konto anlegen", „Namen speichern" — waren mit 5,48:1 in Ordnung.

Richtiggestellt gegenüber der Runde am 01.09.2026 (`c810461`).

### Die Nachmessung musste dreimal berichtigt werden

Weil sie sonst Schweigen durch Lärm ersetzt hätte, und das ist kein Fortschritt:

1. **Schriftfarbe aus dem Bild geraten** → siehe oben. Sie kommt jetzt aus
   `getComputedStyle`. axe scheitert am *Hintergrund*, nie am Vordergrund.
2. **Häufigste Farbe als Hintergrund.** Auf einem Farbverlauf sind die zwei
   häufigsten Bildfarben beide Hintergrund; der Abstand zwischen zwei
   Verlaufsstufen ist kein Textkontrast. Gewertet wird jetzt der **ungünstigste**
   Bildpunkt: Steht Text auf einem Verlauf, entscheidet die Stelle, an der er am
   schlechtesten steht.
3. **Bis an den Rand gemessen.** Die Kantenglättung an runden Ecken mischt
   Knopf- und Seitenfarbe; diese Mischfarben wurden als ungünstigster
   Hintergrund gewählt — 1,93:1 für einen Knopf, der 5,48:1 hat. Der Rand wird
   jetzt weggeschnitten.

Dazu: Farbübergänge sind während der Prüfung abgeschaltet, sonst wird nach einem
Themenwechsel eine Zwischenstufe abgelichtet, die es in keinem Thema gibt.
Zierzeichen bleiben außen vor — was unter `aria-hidden` liegt oder keinen Text
enthält, wird nicht als Textkontrast gewertet; dafür gilt 3:1 nach WCAG 1.4.11.

### Von der neuen Prüfung selbst gefunden: der Anmelde-Hero

Nicht gemeldet, sondern von der berichtigten Nachmessung entdeckt. Der Verlauf
der Anmeldeseite nimmt `--primary`; im dunklen Schema ist das `#80a3b5`, und die
Schrift darin ist fest weiß — **2,68:1**. Der Verlauf steht jetzt fest und folgt
dem Thema nicht mehr: Er ist Zierde, seine Schrift ist es nicht. (`f5893e5`)

*Abnahmebezug: „Tastaturbedienung, sichtbarer Fokus, Labels sowie Status- und
Fehlermeldungen nach WCAG 2.2 AA".*

### Das Schema kam nach dem Code

**Gemeldet von Luca Wollny.** Konvertierungsfehler `column "run_config" of
relation "imports" does not exist`.

Die Spalte war am Vorabend mit `88d95ec` eingeführt worden. Das Anlegen des
Schemas war ein Handgriff nach dem Ausrollen (`npm run migrate`), an den man
sich erinnern musste. Wer ihn vergaß, merkte nichts — der Server startete, die
Seite lud, und der Fehler traf den nächsten, der die betroffene Stelle benutzte.

Weboberfläche (`server/plugins/schema.ts`) und Hintergrundprozess wenden das
Schema jetzt beim Start selbst an, gegen eine Vorkehrungssperre
(`pg_advisory_lock`, weil beide gleichzeitig starten), und brechen bei einem
Fehlschlag ab, statt mit veraltetem Schema hochzukommen. `DB_SCHEMA_AUTO=0`
schaltet das ab, wenn die Datenbank fremd verwaltet wird; dann bleibt
`npm run migrate` der Weg.

Beim Nachgehen kam ein zweites Loch heraus, das schwerer wiegt: Der
Auslieferungscontainer kopiert nur `.output`. Weder `db/schema.sql` noch
`server/db/migrate.ts` lagen dort. **Eine gebaute Auslieferung konnte ihr
eigenes Schema also überhaupt nicht anlegen** — die Anleitung beschrieb einen
Weg, den das Abbild nicht hergab. Aufgefallen war das nie, weil die Testinstanz
im Entwicklungsmodus läuft und dort alle Dateien liegen. Die Datei liegt jetzt
über `nitro.serverAssets` im Bundle.

*Abnahmebezug: „Die Anwendung kann anhand der bereitgestellten Dokumentation
installiert, initialisiert, gestartet, gebaut und getestet werden."*

Nebenbei: 54 PostgreSQL-NOTICE-Zeilen je Start — `IF NOT EXISTS` quittiert jedes
übersprungene Objekt — sind über `onnotice` stillgelegt. Sie verdeckten alles,
was danach im Protokoll kam.

### Prozentring in der Datensatz-Detailansicht

**Gemeldet von Stefan Stretz.** In der Datensatzliste war der Prozentwert wie
verabredet durch „x von y Kernfeldern" ersetzt, in der Detailansicht stand er
noch, samt Ring.

Ersetzt durch dieselbe Angabe wie in der Liste, samt Namen der fehlenden
Kernfelder. Der Detail-Endpunkt lieferte `core` bereits mit; es fehlte nur die
Anzeige.

### „Importe" war als aktuelle Seite ausgezeichnet, wo man nicht war

**Gemeldet von Stefan Stretz.** Auf Nutzerverwaltung, Profil und Dokumentation
blieb „Importe" in der Hauptnavigation als aktiver Punkt markiert.

`active` gab „imports" als Auffangwert für jeden nicht erkannten Pfad zurück.
Damit stand dort `aria-current="page"` auf einem Punkt, auf dem man nicht steht
— für ein Vorlesewerkzeug keine Kleinigkeit, sondern eine falsche Ortsangabe.
Jetzt nur noch für `/` und `/imports/…`.

### Nicht gebaut, weil schon erledigt

**Gemeldet von Stefan Stretz:** Auf kleineren Viewports verschwindet die
Hauptnavigation vollständig.

War mit `8dbc060` am selben Vormittag behoben. Stefans Mail (09:25) und die
Antwort an Elias (11:55) haben sich gekreuzt.

### `aria-prohibited-attr`: das Abzeichen „veraltet" hieß anders, als es aussah

Nicht gemeldet, sondern von der erweiterten Prüfung sichtbar gemacht — es stand
bis zu 39-mal je Seite als „nicht beurteilt" im Protokoll, seit die Prüfung
`incomplete` überhaupt ausgibt.

Das Abzeichen trug seine Erklärung in `aria-label` auf einem `<span>`. Ein
`<span>` ohne Rolle ist `generic`, und dort ist ein Name unzulässig:
Vorlesewerkzeuge ignorieren ihn — dann war die Erklärung für sie gar nicht da —
oder sie lesen ihn **statt** des sichtbaren Wortes „veraltet". Dann heißt das
Abzeichen anders, als es aussieht, und wer die Oberfläche mit der Stimme
bedient, findet es unter seiner Beschriftung nicht mehr. *Abnahmebezug: WCAG
2.5.3, Label in Name.*

Die Erklärung steht jetzt als sichtbar verborgener Text daneben.
`aria-describedby` war der erste Versuch und ist wieder entfernt: Im Barrierebaum
von Chromium nachgesehen steht ein `<span>` ohne Rolle gar nicht als eigener
Knoten drin, eine Beschreibung daran geht ins Leere. Nachgemessen statt
angenommen — sonst wäre eine Verdrahtung stehen geblieben, die gut aussieht und
nichts tut.

Der Preis ist Umständlichkeit: Die Erklärung gehört jetzt zum Text der
Tabellenzelle und wird beim Durchgehen mitgelesen. Das ist den Zustand davor
wert, in dem sie nur im `title` stand und mit der Tastatur unerreichbar war; für
die Maus bleibt der `title` stehen. Danach 0 Verstöße und 0 nicht beurteilte
Stellen. (`d7fe60e`)

### Lucas zwei Frontend-Fehler: nicht reproduzierbar, Ursache trotzdem entschärft

**Gemeldet von Luca Wollny:** ein Vue-Codegen-Fehler in `users/index.vue` und
`useRuntimeConfig` außerhalb des Nuxt-Kontexts beim Laden — beide traten am Ende
seines Tests schon nicht mehr auf.

Nachgestellt: sechs Seiten, je beim Neuladen und beim Navigieren im Browser,
**keine einzige Konsolenmeldung**. Die Zeitachse erklärt es: Er testete, während
`8dbc060` (10:28) und `34c2be1` (10:32) ausgerollt wurden, und die Testinstanz
läuft im Entwicklungsmodus mit laufendem Neuladen.

Das ist keine Entwarnung, sondern eine Prozessfrage: **Ein Tester auf einer
Instanz im Entwicklungsmodus sieht Fehler, die es nicht gibt**, und kann sie
nicht von echten unterscheiden. Für den Nutzertest der Abnahme gehört ein
gebauter Stand her.

Die Ursache hinter der zweiten Meldung ist echt und jetzt entschärft: `useApi()`
las die API-Basis über `useRuntimeConfig()`, das außerhalb des Nuxt-Kontexts
wirft. Der Zugriff läuft über `tryUseNuxtApp()`, das `null` zurückgibt statt zu
werfen. Nebenbefund, unangetastet und hier notiert: In 16 Dateien steht
`useHead()` nach einem `await` auf oberster Ebene — dieselbe Familie von
Kontextproblemen, gemessen ohne Meldung.

### Der Auslieferungsbau ist geprüft

`nuxt build` läuft durch, und `db/schema.sql` liegt als
`.output/server/chunks/raw/schema.mjs` im Bündel. Damit ist die Schema-Änderung
oben auch außerhalb des Entwicklungsmodus belegt und nicht nur behauptet.

### Offen geblieben aus dieser Runde

- **i18n.** Die Vokabular-Beschriftungen werden noch nicht überall genutzt,
  einzelne Enum-Werte erscheinen technisch, und Fehlermeldungen kommen weiterhin
  auf Deutsch aus dem Backend. Die englische Oberfläche ist damit nicht
  vollständig. *Ausdrücklicher Bestandteil des Werkvertrags.*
- **Anbindung an die AVefi-Authentifizierung.** Es gibt derzeit eine eigene
  Nutzerverwaltung mit Konten, Passwörtern, Sperren und Zurücksetzen. Wie das
  für die spätere Integration gedacht ist, ist eine Vertrags-, keine Codefrage.
- **Zielgruppe und vorausgesetztes Vorwissen.** Offen, und Voraussetzung für
  jede weitere Vereinfachung von Importübersicht, Zuordnung und Format-Review.
- **Rückmeldungen von Matti Stöhr** aus dem Pad: Beanstandungen direkt
  ansteuerbar, flexible Sortierung und Filterung, kontextsensitive Hilfe,
  Wording „Fassung" → „Manifestation" und „die Auswahl gehoert einem Menschen" →
  „Bitte manuell zuordnen". Noch nicht angefasst.

---

## 2026-09-01 — Elias Oltmanns, Test mit Vorlesewerkzeug

Commits `8dbc060`, `34c2be1`.

Sechs Befunde aus einem Durchgang mit Vorlesewerkzeug und Tastatur, dazu zwei
Nebenbefunde beim Nachgehen.

- **Hauptnavigation unter 820 Pixeln ersatzlos ausgeblendet.** Per CSS auf
  `display:none`, ohne Aufklappmenü. `display:none` nimmt einen Zweig auch aus
  dem Barrierebaum, deshalb war er weder mit der Tabulatortaste noch mit der
  Browsersuche zu finden. Betrifft jeden, der die Darstellung vergrößert —
  vergrößerte Darstellung wirkt für die Seite wie ein schmales Fenster. Es gibt
  jetzt einen Aufklappknopf; im Tastaturdurchlauf bei 800 Pixeln steht er an
  Position 3.
- **Speichern ohne erkennbare Rückmeldung.** Die Bestätigung war da, aber an
  eine Bedingung geknüpft — das Element entstand gemeinsam mit seinem Text. Ein
  Meldebereich, der erst mit seiner Meldung in die Seite kommt, wird von den
  verbreiteten Vorlesewerkzeugen nicht angesagt. Der Fehler steckte an 50 Stellen
  in 22 Dateien nach demselben Muster; die Bereiche stehen jetzt dauerhaft in der
  Seite, nur ihr Inhalt wechselt.
- **Doppelte Vokabulareinträge nach einem Upload in falscher Kodierung**
  („Französisch" und „franz?sisch"). Zwei Ursachen: Die Anwendung las jede Datei
  als UTF-8, weil sie nichts anderes kannte — sie erkennt die Kodierung jetzt,
  liest Windows-1252 als Windows-1252 und hält im Prüfbericht fest, wie gelesen
  wurde. Und die gespeicherte Werteliste behielt jeden Eintrag, auch wenn er in
  der Datei nicht mehr vorkam; solche Einträge sind jetzt als „nicht in dieser
  Datei" ausgewiesen und lassen sich gebündelt entfernen. Sie verschwinden
  bewusst nicht von selbst: Ein Profil über mehrere Lieferungen zu benutzen ist
  der Normalfall, und dann ist eine Häufigkeit von null kein Fehler.
- **`has_format` war nicht zuordenbar.** Das Feld fehlte im Zielkatalog, weil es
  im Schema kein Vokabular ist, sondern eine Liste aus sechs Klassen mit je
  eigener Werteliste. Es gibt jetzt sechs Ziele, eines je Trägerklasse. Geraten
  wird die Klasse nicht: „DV" steht in `FormatVideoTypeEnum` und in
  `FormatDigitalFileTypeEnum`, und welches gemeint ist, sagt der Wert nicht.
- **Die Auswahlliste zeigte höchstens 40 Einträge, der Katalog hatte 54.** Ohne
  Suchwort standen Farbe, Ton, Bildfrequenz, Zugangsstatus, Laufzeit, Länge,
  alle drei Sprachen und beide Datumsfelder gar nicht zur Wahl. **Drei davon —
  `has_colour_type`, `has_access_status` und knapp `element_type` — nennt die
  Leistungsbeschreibung namentlich als Felder mit kontrolliertem Vokabular.** Die
  Grenze war unsichtbar; mit der Maus scrollt man dagegen, ohne es zu merken.
  Sie ist weg, die Liste ist nach Ebene gegliedert und die Trefferzahl wird
  angesagt. Dabei kam heraus, dass Suchindex und Suchfeld die Wörter
  unterschiedlich zerlegten — der Index trennte am Punkt, das Feld behielt ihn.
- **Feldpfade nannten eine Ebene, die es nicht gab** („Exemplar, Technik, Farbe";
  „Werk, Werk, Form"). Die mittlere Ebene war ein reiner Anzeigeeimer und hieß
  bei Werksfeldern zufällig auch noch „Werk". Der Pfad nennt jetzt Ebene und
  Feld, sonst nichts.

Zwei Nebenbefunde:

- **Der Vorschlag „Werk › Werk › Form" für `category: avefi:Item has_format`**
  kam zustande, weil „format" mit dem Stichwort „form" anfängt. Die Kopfzeile
  sagte zweimal, dass ein Exemplar gemeint ist, und beides wurde nicht gelesen.
  Ein genannter Schemafeldname gilt jetzt als Angabe und schlägt jede
  Wortähnlichkeit; eine genannte Ebene stuft Vorschläge anderer Ebenen zurück,
  statt sie zu verwerfen — die Angabe in einer Kopfzeile kann auch falsch sein.
- **Die Anlage zur Frontend-Kompatibilität verlangt eine konfigurierbare
  API-Basis-URL.** Sie war vorgesehen und wurde von keiner Zeile gelesen: 63
  Aufrufe standen mit festem Pfad in 27 Dateien. Solange der Importer unter
  derselben Herkunft läuft wie sein Server, fällt das nicht auf — unter
  `import.av-efi.net` hinter dem AVefi-Frontend schon. *Abnahmebezug: „API-Basis-
  URLs, Routing und Authentifizierung sind konfigurierbar und dürfen nicht fest
  im Code hinterlegt sein."*

Die Oberflächenbeschreibungen unter `/dokumentation/oberflaeche` entstehen seit
`34c2be1` bei **zwei** Fensterbreiten statt einer. Genau daher kam die
systematische Abweichung, die Elias gefunden hat: Sie beschrieben eine
Tastaturreihenfolge aus einem Durchlauf bei 1500 Pixeln, die für sein Fenster
nie gegolten hat.

---

## 2026-08-31 — Luca Wollny (dritte Runde) und Stefan Stretz (Statusliste)

Commit `88d95ec`.

### Nur eine Normdatenzuordnung je Zweig kam im Export an

**Gemeldet von Luca Wollny**, mit dem Vorschlag, davor zu warnen. Der Vorschlag
wäre die falsche Antwort gewesen: Es war keine Entwurfsentscheidung, sondern
drei Fehler übereinander.

1. Der Normdatenbedarf wurde je Kette nur für den ersten Abgleichsschritt
   gesammelt — die zweite Quelle wurde nie gefragt.
2. Bestätigte Zuordnungen lagen nur nach Wert vor, nicht nach Quelle, sodass
   eine bestätigte GND-Zuordnung der VIAF-Abfrage als deren eigener Treffer
   zurückgegeben wurde.
3. Die Liste erlaubter Kennungsarten stand fest im Code statt aus dem Schema zu
   kommen.

Mehrere Normdatenquellen im selben Zweig wirken jetzt. Getrennte Zweige braucht
es nur noch dort, wo das Schema am Ziel wirklich nur eine Ressourcenart zulässt
— und dort sagt es die Oberfläche. Neu ist eine Warnung, wenn dieselbe Quelle
zweimal im selben Zweig steht.

### Das Zuordnungsinterface war auf drei Zeilen begrenzt

**Gemeldet von Luca Wollny.** Ein Wert („USA"), der wegen mehrerer Treffer eine
manuelle Zuweisung brauchte, erschien nicht im Fenster und ließ sich deshalb
nicht zuordnen.

Der beschriebene Zielkonflikt zur schnellen Vorschau war keiner: Eine einzige
Konstante steuerte beides — die Vorschau, die nach jeder Änderung neu rechnet
und schnell sein muss, und die Zuordnungsliste, die ein Mensch abarbeitet und
vollständig sein muss. Getrennt lösen sich beide Anforderungen auf. Die Liste im
Zweig rollt jetzt und führt alle Werte; dazu gibt es unter
`/mappings/<id>/normdaten` eine eigene Seite für den Durchgang am Stück, mit
Häufigkeit je Wert und Filter „nur offene". Sie hängt am Profil und nicht am
Import, damit Testperson 2 beim Einlesen des Profils die Entscheidungen von
Testperson 1 mitbekommt.

Für Lucas Profil wurden dort **300 offene Entscheidungen in 20 Gruppen**
sichtbar. Das Drei-Zeilen-Fenster hatte die Aufgabe nicht kleiner gemacht, nur
unsichtbar.

### Stefan Stretz' Statusliste

Umgesetzt: die Hierarchie Werk → Fassung → Exemplar (Exemplare stehen eingerückt
unter ihrer Fassung, die Zugehörigkeit kommt aus `is_item_of` und wird nicht
geraten), die Trennung von Abdeckung, Vollständigkeit und Validität (kein
Prozentwert mehr, sondern „3 von 4 Kernfeldern" samt Namen der fehlenden), die
Fehleranzeige am Feld mit Quellfeld und AVefi-Schemapfad, 114 deutsche
Beschriftungen für die Vokabulare, und die Umstellung auf Tailwind 4 mit
daisyUI 5.

Zur Umstellung, weil sie für die Abnahme zählt: Die Themen tragen die Farbwerte
aus der Barrierefreiheitsarbeit vom 25.08. Deshalb hat die neue Grundlage die
Kontraste nicht zurückgeworfen — 75 Stände in beiden Farbschemata erneut
geprüft. *Zu dieser Aussage siehe die Richtigstellung vom 01.09.: Die Prüfung
konnte die Knöpfe zu diesem Zeitpunkt gar nicht beurteilen.*

### Zwei bewusste Abweichungen von Stefans Präzisierungen

- **„Veraltet" wird abgeleitet, nicht gespeichert.** Verglichen wird die
  Profilfassung, mit der konvertiert wurde, mit der Fassung, die das Profil heute
  trägt. Ein gespeichertes Kennzeichen würde driften, sobald jemand ein Profil
  ändert, ohne dass Importcode läuft — und Mappingprofile sind
  institutionsübergreifend sichtbar. Der erste Lauf wies sechs von 83 Importen
  als veraltet aus, einen aus Fassung 3 bei heute Fassung 60.
- **Die feste Transformationsreihenfolge wird vorgeschlagen und geprüft, nicht
  erzwungen.** Als starre Regel umgesetzt, hat sie beim ersten Lauf „Leerraum
  entfernen" nach „Aufteilen" beanstandet — was richtig ist, weil der Konverter
  dann auf jedes Element wirkt. Eine erzwungene Reihenfolge hätte den Anwender
  zu einer schlechteren Kette gedrängt. Beanstandet wird jetzt nur der Fall, der
  wirklich schadet: nachschlagen, bevor der Suchwert fertig gebildet ist. Zweiter
  Grund: Würde die Ausführung intern umsortieren, sähe der Anwender im Editor
  eine andere Reihenfolge als die gerechnete.

### Reproduzierbarkeit hatte ein Loch

Aus Stefans Präzisierung zu den Transformationseinstellungen: Das
CSV-Trennzeichen wurde bei **jedem** Lesen neu erraten und stand nirgends.
Dieselbe Datei konnte nach einer Änderung an der Erkennungsheuristik anders
zerfallen, ohne dass sich Datei oder Profil geändert hätten. Jetzt wird einmal
geraten, beim Erkennen, und festgehalten — zusammen mit Profilfassung,
Profilformat- und Schemaversion und den Einstellungen des Laufs (`run_config`).

*Abnahmebezug: „Derselbe Testdatensatz mit demselben Mappingprofil erzeugt ein
semantisch identisches AVefi-JSON."*

### Zwei Befunde, die die Runde betreffen

- In Lucas Profil wird die Spalte „Produktion" mit der Normdatenart „Person"
  abgefragt, gemeint ist die Produktionsfirma. So trifft die Abfrage nie, und es
  sieht aus wie „nichts gefunden". Die Oberfläche hat das zugelassen und
  geschwiegen; jetzt meldet sie es. Korrigieren muss das Profil sein Eigentümer.
- Die Paderborner Testdatei besteht `efi-conv check` nicht, weil die Zeilen 61/62
  und 65/66 dieselbe Signatur tragen und die Signatur auf die Exemplarkennung
  gemappt ist. Der Importer weist das jetzt als Beanstandung mit Zeilennummern
  aus, statt die Kennung still eindeutig zu machen: Ob die Zeilen dasselbe
  Exemplar meinen oder die Spalte nicht als Kennung taugt, kann nur das Archiv
  entscheiden. **An dieser Frage hängt Lucas offene Zeile „Validierung der
  gemappten Daten".**

---

## 2026-08-26 — Barrierefreiheit, Oberflächenbeschreibungen, Lucas zweite Runde

Commits `c329f5d`, `84f2d79`, `c6c814e`, `51cecf8`, `cc7ca3f`, `beb2d6a`,
`bdbbd9b`, `a050b94`.

- **Ablagefläche nicht mehr bedienbar** — der Klick öffnete die Dateiauswahl
  nicht mehr (`c329f5d`). Ein Symptom im Browser, dessen Ursache nicht im
  gemeldeten Bereich lag.
- **Barrierefreiheit** (`84f2d79`): Kontraste, Fokusführung, rollende Bereiche.
  258 Kontrastverstöße behoben; die Werte sind seither gegen 4,5:1 gerechnet und
  stehen an einer Stelle. Eine frühere Lösung mit `.45` Deckkraft für
  abgeschaltete Knöpfe hatte allein 130 Verstöße eingetragen.
- **Normdatensuche fragte den Rohwert statt den Wert nach der Konverterkette**
  (`c6c814e`) — **gemeldet von Luca Wollny**: „DE" fand keinen GND-Treffer,
  während die automatische Konvertierung vorher zu „Deutschland" normalisierte
  und traf. Damit zeigte der Editor etwas anderes als der Export.
- **Die Oberfläche in Worten** (`51cecf8`, `cc7ca3f`, `beb2d6a`, `a050b94`):
  Beschreibungen jedes Stands für den Test mit Vorlesewerkzeug, später als Seite
  in der Anwendung selbst. Das Beschreiben fand Dinge, die keine maschinelle
  Prüfung findet — etwa Löschknöpfe, die für ein Vorlesewerkzeug alle gleich
  hießen und jetzt Nummer und Ebene nennen.
- **Normdaten und Ländertabelle wirken jetzt auch im Export** (`bdbbd9b`) —
  **gemeldet von Luca Wollny**: In der Weboberfläche stimmte es, im Export
  fehlten `same_as`, `located_in` und `Director`, und Werte in `has_name` waren
  durch Normdaten-IDs ersetzt.

---

## 2026-08-25 — Projekttreffen, Neufassung auf Nuxt 4

Commits `5290811`, `79cb475`, `d90396d` (Tag `php-final`), `69408c2`, `3366696`,
`7da1b2a`.

Im Treffen verabredet und am selben Tag durchgezogen: Der PHP-Prototyp wird auf
das eigentliche Vue-Frontend überführt. Der letzte PHP-Stand liegt unter dem
annotierten Tag **`php-final`**.

- **Excel-Import mit Auswahl der Tabellenblätter** (`d90396d`).
- **Neufassung auf Nuxt 4 mit Vue 3 und TypeScript** (`69408c2`). *Abnahmebezug:
  „Die Benutzeroberfläche ist mit Vue-3-Single-File-Components umgesetzt" und
  „Für Komponenten, Props, Events und gemeinsam genutzte Datenstrukturen wird
  TypeScript verwendet".*
- Zwei Tabellenfehler und ein abgeschnittener Knopf in der Aktionsspalte
  (`5290811`, `79cb475`), Fortschrittsbalken und Zähler der Importliste
  (`3366696`), Dokumentation an die Neufassung angeglichen (`7da1b2a`).

### Bekannte Einschränkung aus dieser Umstellung

`.xls` und `.ods` werden nicht gelesen. In der Dokumentation benannt.

---

## 2026-08-24 — Luca Wollny, erster Testbericht

Commit `fd42c3c`. Weitergeleitet über Antje Dittmann, Briefing durch Jonas Pitz.

GND-Abgleich repariert, Bestätigen von Normdatenzuordnungen, Normalisierung von
Länderangaben. Der Bericht war präzise genug, um alles nachzustellen, und traf
Stellen, die eigene Durchgänge nicht getroffen hatten.

---

## 2026-08-19 bis 21 — Mapping-Profile und Jonas Pitz' Rückmeldung

Commits `47f5bdf`, `f3b474a`, `06757f1`, `c4b6f1d`, `0d8b259`, `4ac0f2a`,
`a8310e9`, `d282950`.

- **Mapping-Profile**, Entwurf am 19.08. mit Jonas Pitz abgestimmt: CSV/TSV
  werden zugeordnet statt geraten (`f3b474a`), Editor auch ohne Import, Anlegen
  per Beispieldatei, Verzweigungsansicht (`06757f1`).
- **Ausgelieferter Fehler: leere Seite** (`c4b6f1d`). Der Mapping-Editor blieb
  leer, weil das Wurzel-Template nicht aus dem Mount-Element kam.
- **Vorschau zeigt drei gesuchte Beispiele je Spalte statt nur Zeile 1**
  (`0d8b259`) — Beispiele suchen, nicht abzählen.
- **Normdaten ergänzen statt überschreiben** (`d282950`) — **gemeldet von Jonas
  Pitz am 20.08.**: Beim Anlegen von Normdaten für Regisseure wurde der Name mit
  der ID überschrieben, statt einen GND-Link zu ergänzen. Dazu Profil-Export mit
  Beispieldaten.
- Kontextmenü statt Papierkorb in der Importliste, Neu-Konvertieren mit Warnung
  (`47f5bdf`); feste Spaltenbreiten statt waagerechtem Rollbalken (`4ac0f2a`);
  farbige Vorschau-Ergebnisse mit Haken bzw. Warnzeichen (`a8310e9`).

---

## 2026-07-25 bis 27 — Erste Fassung, vor dem Werkvertrag

Commits `d5d142e` bis `95cdc1f`.

Vorarbeit, entstanden vor dem formellen Go am 31.07.2026 und vor dem Kick-Off am
11.08.2026: die vollständige Anwendung als PHP-Fassung (`1fb4c46`), Handbuch und
Gerüst für die PID-Registrierung (abgeschaltet, `ba50f57`), Worker-Warteschlange
und Fehlerreport (`8dc8a73`, `733b3e3`, `6d1ff84`), sowie der
AVefi-Schema-Editor in Vue 3 mit Abgleich gegen GND, Wikidata und VIAF
(`0116acc`, `18e136e`, `95cdc1f`).

Dieses Mockup war beim Kick-Off der gezeigte Zwischenstand.

---

## Dauerhaft bekannte Einschränkungen und Annahmen

Diese Liste ergänzt die ausführliche Fassung in der `README.md`.

- **`.xls` und `.ods` werden nicht gelesen.** Nur `.xlsx`.
- **Der Testserver läuft im Entwicklungsmodus.** Der Auslieferungspfad ist im
  Dockerfile als eigene Stufe enthalten und in der README beschrieben. Mehrere
  Befunde sind nur deshalb erst spät aufgefallen — zuletzt am 01.09. das im
  Auslieferungsabbild fehlende `db/schema.sql`.
- **Nichts wird zwischengespeichert.** Jede Seite zeigt Daten der angemeldeten
  Institution; ohne `no-store` legt ein vorgelagerter Zwischenspeicher eine
  angemeldete Seite ab und liefert sie weiter aus. Nachweislich geschehen.
- **Normdatenanreicherung ist abschaltbar** (`AUTHORITY_ENABLED`). Vorschau und
  Hintergrundprozess müssen dieselbe Einstellung sehen, sonst zeigt der Editor
  etwas anderes als der Export.
- **`efi-conv` wird referenziert, nicht nachgebaut.** Ein eigener Sidecar
  installiert das Python-Paket und prüft die Ergebnisse damit — derselbe
  Validator, der später die Lieferung prüft.
- **`RecordMapper::classify`** lebt für JSON-Quellen weiter; die dortigen
  Teilstring-Treffer sind nicht behoben. Für Tabellen macht es `MappingSuggest`
  richtig.
