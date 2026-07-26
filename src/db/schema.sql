-- AVefi Importer — PostgreSQL-Schema
-- Wird von Postgres beim ersten Start automatisch ausgeführt
-- (docker-entrypoint-initdb.d). Der Admin-User wird danach per Bot gesetzt:
--   docker compose exec web php app/bot.php -t seed

CREATE TABLE IF NOT EXISTS institutions (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    institution_id  INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT,
    name            TEXT NOT NULL DEFAULT '',
    is_admin        BOOLEAN NOT NULL DEFAULT false,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS format_profiles (
    id            SERIAL PRIMARY KEY,
    converter_key TEXT NOT NULL UNIQUE,   -- muss zur hardcoded FingerprintRegistry passen
    label         TEXT NOT NULL,
    base_format   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
    CREATE TYPE import_status AS ENUM
        ('uploading','queued','awaiting_format_review','converting','converted','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS imports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- benennt /mnt/files/<id>/
    institution_id     INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    filename           TEXT NOT NULL,
    filesize           BIGINT NOT NULL DEFAULT 0,
    base_format        TEXT,                 -- csv/tsv/xml/ead/marcxml/json
    fingerprint        TEXT,
    format_profile_id  INTEGER REFERENCES format_profiles(id),
    status             import_status NOT NULL DEFAULT 'uploading',
    upload_progress    SMALLINT NOT NULL DEFAULT 0,
    record_count       INTEGER NOT NULL DEFAULT 0,
    error_count        INTEGER NOT NULL DEFAULT 0,
    storage_path       TEXT,
    report_json        JSONB,                -- Parse-/Validierungsbericht (Fehlerreport)
    detected_format    TEXT,                 -- erkanntes Format/Schema fürs Badge (z. B. „AVefi (nativ)")
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nachrüst-Spalten für Bestands-DBs (migrate-Bot): CREATE TABLE IF NOT EXISTS legt
-- neue Spalten nicht an, daher hier idempotent per ALTER.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS report_json     JSONB;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS detected_format TEXT;

CREATE TABLE IF NOT EXISTS records (
    id                   SERIAL PRIMARY KEY,
    import_id            UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    work_title           TEXT,
    work_year            INTEGER,
    work_type            TEXT,
    avefi_pid            TEXT,
    manifestation_count  INTEGER NOT NULL DEFAULT 0,
    item_count           INTEGER NOT NULL DEFAULT 0,
    completeness         SMALLINT NOT NULL DEFAULT 0,   -- 0..100
    data_json            JSONB NOT NULL DEFAULT '{}',   -- vollständiges AVefi-Record (Work+Manif.+Items)
    source_row           INTEGER,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS format_reviews (
    id           SERIAL PRIMARY KEY,
    import_id    UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    fingerprint  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',   -- open/resolved/rejected
    sample_json  JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('queued','running','done','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Worker-Queue: der worker-Daemon konsumiert per SELECT … FOR UPDATE SKIP LOCKED
-- (kein Redis nötig) und ruft \worker\<classname>::run($payload) auf.
CREATE TABLE IF NOT EXISTS worker_jobs (
    id           SERIAL PRIMARY KEY,
    classname    TEXT NOT NULL,                -- Worker-Klasse: detect / convert / download / register_pid
    import_id    UUID REFERENCES imports(id) ON DELETE CASCADE,   -- optional, für Cascade-Cleanup
    payload      JSONB NOT NULL DEFAULT '{}',
    status       job_status NOT NULL DEFAULT 'queued',
    attempts     INTEGER NOT NULL DEFAULT 0,
    run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),   -- frühester Ausführungszeitpunkt
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_imports_institution ON imports(institution_id);
CREATE INDEX IF NOT EXISTS idx_records_import       ON records(import_id);
CREATE INDEX IF NOT EXISTS idx_worker_jobs_status   ON worker_jobs(status, run_at);

-- Start-Institution (Passwort des Admin-Users setzt der Seed-Bot).
INSERT INTO institutions (name, slug) VALUES ('Deutsches Filminstitut', 'dfi')
    ON CONFLICT (slug) DO NOTHING;
