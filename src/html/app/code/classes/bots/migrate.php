<?php
/*
 * migrate — spielt das mitgelieferte, idempotente db/schema.sql gegen die laufende DB.
 * Legt fehlende Tabellen/Typen/Indizes an (CREATE … IF NOT EXISTS, DO-Blöcke, ON CONFLICT),
 * bestehende Daten bleiben unberührt. Nutzt den App-Code, nicht das evtl. veraltete
 * initdb-Mount.
 *
 *   docker compose exec web php app/bot.php -t migrate
 *
 * Schema-Pfad optional per SCHEMA_PATH überschreibbar.
 */

namespace bots;

class migrate {

	public static function run(array $atts = []): void {
		$schema = self::locateSchema();
		if ($schema === null) {
			echo "[migrate] schema.sql nicht gefunden. SCHEMA_PATH setzen.\n";
			return;
		}

		$sql = file_get_contents($schema);
		if ($sql === false || trim($sql) === "") {
			echo "[migrate] schema.sql leer oder nicht lesbar: {$schema}\n";
			return;
		}

		echo "[migrate] wende an: {$schema}\n";
		try {
			\DB::pdo()->exec($sql);
		} catch (\Throwable $e) {
			echo "[migrate] Fehler: " . $e->getMessage() . "\n";
			throw $e;
		}

		$tables = \DB::rows("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
		echo "[migrate] fertig. Tabellen: " . implode(", ", array_column($tables, "tablename")) . "\n";
	}

	private static function locateSchema(): ?string {
		$env = getenv("SCHEMA_PATH");
		if ($env !== false && $env !== "" && is_file($env)) return $env;

		$candidates = [
			dirname(__DIR__, 5) . "/db/schema.sql",   // src/db/schema.sql (Standard)
			dirname(__DIR__, 4) . "/db/schema.sql",   // html/db/schema.sql (falls dort abgelegt)
			"/var/www/db/schema.sql",                 // absoluter Container-Pfad
		];
		foreach ($candidates as $c) {
			if (is_file($c)) return $c;
		}
		return null;
	}
}
