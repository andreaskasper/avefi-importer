# 6 · PID-Registrierung

> **Status: vorbereitet, aber nicht freigeschaltet.** Die eigentliche PID-Vergabe
> übernimmt AVefi später selbst. Im Code liegt bereits ein deaktiviertes Gerüst bereit;
> die Oberfläche hat einen Button, der aktuell nur einen Hinweis anzeigt.

## Was ist ein PID?

Ein **PID** (Persistent Identifier) ist ein dauerhafter, auflösbarer Bezeichner für
einen Datensatz — im AVefi-Kontext ein **Handle** mit dem Präfix `21.11155`, z. B.
`21.11155/abcd-1234`. Aufgelöst wird er über den Handle-Resolver:
`https://hdl.handle.net/21.11155/abcd-1234`.

Anders als eine Datenbank-ID ändert sich ein PID nie und bleibt zitierbar, auch wenn
sich Speicherort oder Systemtechnik ändern.

## Warum im Importer?

Ziel des Imports ist, jedes Filmwerk mit einem stabilen AVefi-PID zu versehen. Da das
AVefi-Modell dreistufig ist (**Werk → Manifestation → Exemplar**), erhält perspektivisch
**jede Ebene** einen eigenen PID, und die Ebenen verweisen über diese PIDs aufeinander.

**Wichtig:** Ein PID wird **erst für einen gültigen Datensatz** vergeben (Schema-Prüfung
grün, siehe [Kapitel 3](03-bearbeiten-und-validieren.md)). Man vergibt keine dauerhaften
Identifier für unvollständige/ungültige Daten.

## Geplanter Ablauf

```
Datensatz „gültig"  ──▶  Job register_pid  ──▶  bots/register_pid
                                                   │
                                                   ├─ PidService: Handle beim AVefi-/ePIC-Dienst anlegen
                                                   ├─ zurückgegebenen PID in records.avefi_pid speichern
                                                   └─ (später) Manifestations-/Exemplar-PIDs + Verknüpfung
```

Vorgesehene Bausteine:

1. **Job-Typ `register_pid`** — analog zu `detect`/`convert`, wird für gültige
   Datensätze eingereiht (automatisch nach dem Speichern, oder manuell per Button
   „PID registrieren" im Editor).
2. **Worker `bots/register_pid`** — konsumiert die Queue, ruft den PID-Dienst auf,
   schreibt das Ergebnis zurück, ist **idempotent** (kein erneutes Anlegen, wenn bereits
   ein PID existiert — dann nur Metadaten-Update des Handles).
3. **Klasse `PidService`** — kapselt die Handle-/ePIC-API (Handle anlegen/aktualisieren).
   Mit **Dry-Run-Modus**, solange keine echten Zugangsdaten vorliegen: erzeugt einen
   Platzhalter-PID lokal, damit sich der Ablauf testen lässt.

## Konfiguration (geplant)

Über Umgebungsvariablen, z. B.:

| Variable        | Bedeutung |
|-----------------|-----------|
| `PID_ENDPOINT`  | URL des Handle-/ePIC-Registrierungsdiensts |
| `PID_PREFIX`    | Handle-Präfix (z. B. `21.11155`) |
| `PID_USER` / `PID_PASSWORD` | Zugangsdaten des Registrierungskontos |
| `PID_DRYRUN`    | `true` = keine echte Registrierung, nur Platzhalter |

## Aktueller Stand im Code (vorbereitet, deaktiviert)

- **`PidService`** (`src/html/app/code/classes/PidService.php`) — Gerüst mit
  `isEnabled()` (Default **false**), `prefix()`, `resolveUrl()` und einer `register()`-
  Methode, die noch nicht implementiert ist und ohne Konfiguration `null` liefert.
- **`bots/register_pid`** — Worker-Gerüst, das nichts tut, solange `PidService`
  deaktiviert ist.
- **PID_\*-Umgebungsvariablen** sind in `src/docker-compose.yml` auskommentiert
  vorbereitet.
- **Editor-Button „🔗 PID registrieren"** — zeigt aktuell nur ein Hinweis-Modal
  („Diese Funktion ist noch nicht freigeschaltet …"); es wird nichts registriert.

Zum Freischalten muss AVefi lediglich `PidService::register()` implementieren, die
PID_\*-Variablen setzen und den Button/Job aktiv schalten — die Struktur steht.

## Was noch fehlt

- **Zugangsdaten + Endpunkt** des echten AVefi-PID-Dienstes (Handle-Präfix-Konto).
- Festlegung, ob zunächst nur **Werk-PIDs** vergeben werden oder direkt alle drei Ebenen.
- Das **Landing-/Metadaten-Ziel**, auf das der PID auflöst (welche URL/Repräsentation).

In der Oberfläche ist die Spalte **„AVefi-PID"** (Datensatz-Liste) bereits vorhanden und
zeigt bis dahin „noch keine".
