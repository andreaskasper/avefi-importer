# 5 · Benutzerverwaltung (Admin)

Administrator:innen öffnen die Verwaltung über das **Avatar-Menü** (oben rechts) →
**Nutzer verwalten** (`/users`).

## Nutzer anlegen

Formular „Neuen User anlegen": E-Mail, Name, Initial-Passwort (min. 8 Zeichen),
Institution, optional Administrator-Rolle. Doppelte E-Mail-Adressen werden abgelehnt.

## Nutzer bearbeiten

**„Bearbeiten"** öffnet die Detailseite:

- **Stammdaten**: Name, Institution, Administrator-Rolle, Aktiv-Status (Login erlaubt).
- **Passwort zurücksetzen**: neues Passwort setzen (min. 8 Zeichen).

## Sperren / Entsperren / Löschen

In der Liste je Nutzer:

- **Sperren / Entsperren** — deaktiviert bzw. reaktiviert den Login (gesperrte Konten
  können sich nicht anmelden).
- **🗑 Löschen** — Konto endgültig entfernen (mit Rückfrage).

## Selbstschutz

Das eigene Konto lässt sich **nicht** sperren, entmachten oder löschen — so kann sich
niemand versehentlich selbst aussperren.

> Passwörter werden mit **Argon2id** gehasht gespeichert; im Klartext existieren sie
> nur bei der Eingabe. In der Datenbank (Adminer) ist nur der Hash sichtbar.
