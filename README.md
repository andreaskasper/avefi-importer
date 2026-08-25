# 🎞️ AVefi Importer

**Turn any film-metadata file into clean [AVefi](https://www.av-efi.net) records.**

Archives and institutions upload their metadata exports — the importer detects the
format, converts it into the **AVefi schema** (Work → Manifestation → Item),
validates every record against a JSON Schema and lets curators fine-tune the result
before a persistent identifier (PID) is registered.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![PHP](https://img.shields.io/badge/PHP-8.1%2B-777bb4.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed.svg)
![Status](https://img.shields.io/badge/status-work%20in%20progress-orange.svg)

> **Interim host:** `avefiimporter.goo1.de` · **Target host:** `import.av-efi.net`

> **Repository layout:** the application lives in [`src/`](src/), ready-to-import
> example data in [`samples/`](samples/). Run all `docker`/`compose` commands from `src/`.

---

## ✨ Features

- 📥 **Drop-and-go upload** — CSV · TSV · XML · EAD · MARC-XML · JSON, plus **upload via URL**
- 🔍 **Automatic format detection** — a fingerprint per file, matched against a
  registry; XML is recognised as MARC-XML / EAD by root element + namespace
- 🔄 **Format-specific converters** — generic CSV/TSV/JSON, **MARC-XML** and **EAD**,
  each emitting an AVefi *Work* with its *Manifestations* and *Items*
- ✅ **Schema validation** — records are checked against
  [`src/html/schema/avefi-record.schema.json`](src/html/schema/avefi-record.schema.json)
  (a JSON Schema; interim stand-in for the LinkML-generated
  [`av-efi-schema`](https://github.com/AV-EFI/av-efi-schema)), plus a completeness score (0–100)
- 🧑‍💻 **Curator editor** — Work → Manifestation → Item, live validation, AVefi-JSON export
- 🛠️ **Format review queue** — unknown formats pause the import for an admin to resolve
- 👥 **Admin user manager** — create / edit / lock / reset password / delete
- 🐘 **No Redis, no message broker** — the worker consumes a PostgreSQL job queue
  via `SELECT … FOR UPDATE SKIP LOCKED`

---

## 🧭 How it works

```
Upload ──▶ Queued ──▶ Format detection ──┬─▶ known   ─▶ Convert ─▶ Converted · editable
                                         └─▶ unknown ─▶ Format review (admin resolves)
```

| Stage | What happens | Import status |
|-------|--------------|---------------|
| **Upload**   | File stored (or downloaded from a URL), `detect` job enqueued | `uploading` → `queued` |
| **Detect**   | Base format + fingerprint computed, converter chosen | `converting` or `awaiting_format_review` |
| **Convert**  | Converter emits Work/Manifestation/Item, validates each | `converted` / `error` |
| **Register** | AVefi PID assigned (after `valid`) | — |

Unknown format? The import waits in the review queue until an admin assigns a
converter (or a developer adds a format-specific one).

---

## 🚀 Quick start

Requirements: Docker + Docker Compose.

```bash
git clone https://github.com/andreaskasper/avefi-importer.git
cd avefi-importer/src                              # the application lives in src/

docker compose up -d --build                       # web + PostgreSQL + Adminer
docker compose exec web sh -c "cd app/code && php composer install"   # Excel-Unterstützung
docker compose exec web php app/bot.php -t seed     # create the admin user
```

Then open the app and sign in:

| Service | URL | Notes |
|---------|-----|-------|
| **App**     | http://localhost:8080 | login `admin@av-efi.net` / `changeme` |
| **Adminer** | http://localhost:8081 | PostgreSQL UI (the phpMyAdmin alternative), server `db` |

Try it out with a file from [`samples/`](samples/) (CSV/TSV/JSON/MARC-XML/EAD). The
**worker** service picks it up automatically (it polls the `worker_jobs` queue). To
process the queue manually instead:

```bash
docker compose exec web php app/bot.php -t detect    # drain detect jobs once
docker compose exec web php app/bot.php -t convert   # drain convert jobs once
```

> ⚠️ **`admin@av-efi.net` / `changeme` are default development credentials — change
> them before your first login.** Set `SEED_EMAIL` / `SEED_PASSWORD` (e.g. in `.env`)
> before running the seed bot; never expose the app publicly with the defaults in place.

> For production, run the app behind your reverse proxy (e.g. Traefik) with your
> own deployment compose file — keep hosts/TLS specifics out of this repo.

---

## ⚙️ Configuration

All configuration is done through environment variables (see `src/docker-compose.yml`):

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV`  | `dev` | `dev` shows errors; anything else logs them to `files/logs/` |
| `APP_HOST` | `avefiimporter.goo1.de` | Public host name |
| `DB_HOST`  | `db` | PostgreSQL host |
| `DB_PORT`  | `5432` | PostgreSQL port |
| `DB_NAME`  | `avefi` | Database name |
| `DB_USER`  | `avefi` | Database user |
| `DB_PASS`  | `avefi` | Database password |
| `FILES_PATH` | `/mnt/files` | Upload storage (`/mnt/files/<uuid>/org/…`) |
| `SEED_EMAIL`    | `admin@av-efi.net` | Admin address created by the `seed` bot |
| `SEED_PASSWORD` | `changeme` | Admin password created by the `seed` bot |

---

## 🗂️ Repository structure

```
README.md · LICENSE
samples/                     example metadata (CSV/TSV/JSON/MARC-XML/EAD)
src/                         the application
  docker-compose.yml         web (PHP-Apache) + PostgreSQL + Adminer
  db/schema.sql              PostgreSQL schema (auto-loaded on first start)
  Dockerfiles/               web / cli / bot images (PHP 8, ext-pgsql)
  docs/architecture.md       pipeline, converter interface, storage layout
  html/
    index.php                front controller (bootstrap, autoloader, routing)
    schema/                  avefi-record.schema.json (validation schema)
    skins/                   app.css · vue.global.prod.js · upload.js · editor.js
    app/
      bot.php                CLI worker / bot runner
      code/classes/          framework core, entities, converters/, bots/
      design/default/        page templates (login, dashboard, editor, …)
```

---

## 🧱 Architecture notes

- **Micro-framework, zero web dependencies.** `index.php` boots a small autoloader
  (`\Foo\Bar` → `app/code/classes/Foo/Bar.php`), the DB layer and the session, then
  hands off to `Routing::start()`. Vue 3 (vendored) is available globally for
  interactive components.
- **Entity + `My*` pattern.** Data objects pair an entity (`User`, `Import`, …) with a
  session-scoped wrapper (`MyUser`) that resolves the current request context.
- **Passwords** are hashed with **Argon2id** (`password_hash`).
- **Worker/queue.** A continuous **worker daemon** (`bot -t worker`, running as its own
  `restart: always` service) polls the `worker_jobs` table (`FOR UPDATE SKIP LOCKED`)
  every minute and dispatches each job to `\worker\<classname>::run($payload)`
  (`download` / `detect` / `convert`). It self-restarts after 7 days or if RAM > 1 GB.
  Frontend and worker share nothing but PostgreSQL and the file system.
- **Converters** implement the `Converter` interface; `ConverterFactory` maps a
  `converter_key` to a class. See `src/docs/architecture.md`.

---

## 🖥️ Screens

The clickable wireframe (`src/wireframe/index.html`) covers the full flow:

1. **Login** — email/password (institutional SSO via eduGAIN/Shibboleth planned)
2. **Import overview** — dropzone + URL upload, progress, per-file processing status
3. **Records** — the AVefi works produced by an import, with completeness & validity
4. **Editor** — Work → Manifestation → Item, live schema validation
5. **Format review** *(admin)* — resolve unknown formats

All five are implemented, plus an admin **user manager** and a **profile** page.

---

## 🧑‍🔬 Development

Run from the `src/` directory:

```bash
# run a bot inside the web container (download / detect / convert / seed)
docker compose exec web php app/bot.php -t detect

# install PHP dependencies (composer image)
docker run --rm -it -v "$PWD/html/app/code":/app -w /app composer:2 install

# lint a file
docker compose exec web php -l app/code/classes/Routing.php
```

Supported source formats: `CSV` · `TSV` · `XLSX`/`XLS`/`ODS` · `XML` · `EAD` · `MARC-XML` · `JSON`.

### Tests

Unit tests (Codeception 5) live in [`codecept_test/`](codecept_test/) and run from the
**repository root** — no running database required:

```bash
php codecept.phar run unit
```

They cover the converters (against `samples/`), schema validation, record mapping,
completeness, fingerprinting and file handling, plus a PHP-lint pass over the codebase.

---

## 🩺 Troubleshooting

*(run these from the `src/` directory)*

**Uploads fail with „Upload-Verzeichnis konnte nicht angelegt werden" / „Speichern fehlgeschlagen".**
The `/mnt/files` volume isn't writable by Apache (`www-data`) — happens when the
`avefi_files` volume was created (root-owned) before the current image was built.
Fix the ownership:

```bash
docker compose exec web chown -R www-data:www-data /mnt/files
# server deployment: add  -f docker-compose.dev.yml  after `compose`
```

A rebuilt image (`up -d --build`) does this automatically on start (`CMD … chown … /mnt/files`).

**Login fails right after `up`.** The admin user only exists after the seed bot ran:

```bash
docker compose exec web php app/bot.php -t seed
```

If it still fails — or you see `relation "…" does not exist` (e.g. `worker_jobs`) — the
DB volume is stale (the schema changed since it was first created; the init script only
runs on an *empty* volume). Apply the current schema **without losing data**:

```bash
docker compose exec web php app/bot.php -t migrate    # idempotent: creates missing tables
```

As a last resort you can recreate the volume (deletes all DB data):

```bash
docker compose down -v && docker compose up -d --build
docker compose exec web php app/bot.php -t seed
```

**An uploaded XML always lands in „Neues Format – Review nötig".** MARC-XML and EAD are
auto-detected; other XML dialects need a format-specific converter, or an admin can
assign one from the review screen. See `src/docs/architecture.md`.

---

## 🗺️ Roadmap

- [x] Auth (Argon2id) + session, login page
- [x] Import overview dashboard
- [x] PostgreSQL schema + job queue
- [x] File upload (drag & drop + progress) **and upload-via-URL** (worker `download` job)
- [x] Worker: `detect` → `convert` → records + `avefi.v1.json`; unknown formats → review queue
- [x] Format-specific converters: generic CSV/TSV/JSON, **MARC-XML** (`marcxml_v1`), **EAD** (`ead_v1`)
- [x] Records list + curator editor (Work → Manifestation → Item, AVefi-JSON export)
- [x] JSON-Schema validation of records (interim schema; LinkML full schema via `opis/json-schema` to follow)
- [x] Format review resolution UI (admin): assign a converter → re-convert, reject, download original
- [x] Admin user manager (create / edit / lock / reset password / delete, self-protected)
- [x] Vue 3 (vendored, global) available for interactive components
- [ ] Real `av-efi-schema` LinkML JSON Schema + PID field mapping
- [ ] AVefi PID registration
- [ ] Institutional SSO (eduGAIN / Shibboleth)

---

## 📝 License

Released under the **MIT License** — see [LICENSE](LICENSE).

Built by [Andreas Kasper](https://github.com/andreaskasper) for the AVefi project.
