# AVefi Importer — Handbuch

Anleitungen für Betrieb und Nutzung des AVefi Importers.

## Inhalt

1. [Installation & Start](01-installation.md) — Umgebung hochfahren, erster Login
2. [Metadaten importieren](02-importieren.md) — Upload, Upload via URL, Formate, Worker
3. [Datensätze bearbeiten & validieren](03-bearbeiten-und-validieren.md) — Liste, Editor, Schema-Prüfung, Export
4. [Format-Review (Admin)](04-format-review.md) — unbekannte Formate auflösen
5. [Benutzerverwaltung (Admin)](05-benutzerverwaltung.md) — Konten anlegen, sperren, Passwörter
6. [PID-Registrierung](06-pid-registrierung.md) — Konzept & geplanter Ablauf *(noch nicht implementiert)*

## Kurzüberblick

Der AVefi Importer nimmt Metadaten-Dateien entgegen (CSV, TSV, XML, EAD, MARC-XML, JSON),
erkennt das Format, konvertiert die Datensätze ins AVefi-Schema (Werk → Manifestation →
Exemplar), prüft sie gegen ein JSON-Schema und stellt einen Editor bereit. Anschließend
kann für gültige Datensätze ein persistenter Identifier (PID) vergeben werden.

> Technische Architektur (Pipeline, Converter, Speicherung): siehe
> [`src/docs/architecture.md`](../src/docs/architecture.md).
