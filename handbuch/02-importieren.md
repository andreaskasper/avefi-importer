# 2 · Metadaten importieren

## Datei hochladen

Auf der Startseite (Import-Übersicht):

- **Drag & Drop** oder **„Dateien auswählen"** — mehrere Dateien gleichzeitig, max. 200 MB.
- Der Fortschritt wird pro Datei angezeigt; danach erscheint der Import in der Liste.

Unterstützte Formate: **CSV · TSV · JSON · MARC-XML · EAD · (weitere XML → Review)**.

Beispieldateien zum Ausprobieren liegen im Repository unter
[`samples/`](../samples/) (`films.csv`, `films.tsv`, `films.json`, `films.marcxml`,
`films.ead`).

## Import via URL

Neben dem Datei-Upload gibt es das Feld **„oder per URL"**: eine öffentlich
erreichbare `https://…`-Adresse eintragen und „Von URL laden". Ein Worker lädt die
Datei im Hintergrund herunter und stellt sie wie einen normalen Upload in die Pipeline.

> Interne/private Adressen (localhost, private IP-Bereiche) werden aus
> Sicherheitsgründen abgelehnt.

## Verarbeitung (Worker)

Nach dem Upload liegt der Import auf **„Wartend"**. Die eigentliche Verarbeitung
übernimmt der Worker in zwei Schritten:

```bash
docker compose exec web php app/bot.php -t detect    # Format erkennen
docker compose exec web php app/bot.php -t convert   # Datensätze erzeugen
```

Ablauf je Import:

| Status | Bedeutung |
|--------|-----------|
| Wartend | in der Warteschlange |
| In Konvertierung | Format erkannt, Converter zugeordnet |
| Neues Format – Review nötig | unbekanntes Format → [Format-Review](04-format-review.md) |
| Konvertiert | Datensätze erzeugt, editierbar |
| Fehler | Parsing/Validierung fehlgeschlagen |

Für Dauerbetrieb laufen die Bots als Schleife (`-r --sleep 30`); Vorlagen dafür sind in
`src/docker-compose.dev.yml` auskommentiert enthalten (`worker_detect`, `worker_convert`,
plus `download`).

## Format-Erkennung

- **CSV/TSV/JSON** mit erkennbarer Titel-Spalte → generischer Converter (deutsche und
  englische Spaltennamen werden heuristisch zugeordnet: Titel, Jahr, Regie, Träger,
  Signatur, Institution, …).
- **MARC-XML** und **EAD** werden am Wurzelelement/Namespace erkannt und mit einem
  spezifischen Converter verarbeitet.
- Alles andere (unbekanntes XML, CSV ohne Titel-Spalte) landet im **Format-Review**.
