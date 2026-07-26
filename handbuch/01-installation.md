# 1 · Installation & Start

Der AVefi Importer läuft als Docker-Compose-Stack (Web + PostgreSQL + Adminer).
Die Anwendung liegt im Verzeichnis `src/`.

## Voraussetzungen

- Docker + Docker Compose

## Lokal starten

```bash
git clone https://github.com/andreaskasper/avefi-importer.git
cd avefi-importer/src

docker compose up -d --build            # web + PostgreSQL + Adminer
docker compose exec web php app/bot.php -t seed   # Admin-Konto anlegen
```

Danach:

| Dienst   | Adresse                | Hinweis |
|----------|------------------------|---------|
| App      | http://localhost:8080  | Login `admin@av-efi.net` / `changeme` |
| Adminer  | http://localhost:8081  | PostgreSQL-Oberfläche, Server `db` |

> ⚠️ **`changeme` vor dem ersten Login ändern.** Entweder vorab per Umgebungsvariablen
> `SEED_EMAIL` / `SEED_PASSWORD` (z. B. in `.env`) setzen, oder nach dem Login unter
> **Mein Profil** (Avatar-Menü oben rechts).

## Server-Deployment (hinter Traefik)

Für den Serverbetrieb gibt es `src/docker-compose.dev.yml` (Routing über die Domain
`avefiimporter.goo1.de` bzw. später `import.av-efi.net`, HTTPS über einen bestehenden
Traefik). Diese Datei ist bewusst **nicht** im Repository (Deployment-Spezifika).

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml exec web php app/bot.php -t seed
```

## Konfiguration

Alles über Umgebungsvariablen (siehe `src/docker-compose.yml`): `DB_*`,
`APP_ENV` (`dev` zeigt Fehler an), `APP_HOST`, `FILES_PATH` (Upload-Ablage,
Standard `/mnt/files`), `SEED_EMAIL` / `SEED_PASSWORD`.

## Häufige Stolpersteine

- **Upload schlägt fehl** („Verzeichnis konnte nicht angelegt werden"): Rechte am
  Volume korrigieren — `docker compose exec web chown -R www-data:www-data /mnt/files`.
- **Login geht nicht direkt nach `up`**: Der Admin existiert erst nach dem `seed`-Lauf.
- Ausführliche Fehlerbehebung: [README → Troubleshooting](../README.md#-troubleshooting).
