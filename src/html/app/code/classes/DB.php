<?php
/*
 * DB — schlanker PDO-Wrapper für PostgreSQL.
 * Konfiguration ausschließlich über Umgebungsvariablen (siehe docker-compose.yml).
 */

class DB {

	private static ?PDO $pdo = null;

	public static function init(): void {
		if (self::$pdo !== null) return;

		$host = getenv("DB_HOST") ?: "db";
		$port = getenv("DB_PORT") ?: "5432";
		$name = getenv("DB_NAME") ?: "avefi";
		$user = getenv("DB_USER") ?: "avefi";
		$pass = getenv("DB_PASS") ?: "avefi";

		$dsn = "pgsql:host={$host};port={$port};dbname={$name}";
		self::$pdo = new PDO($dsn, $user, $pass, [
			PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
			PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
			PDO::ATTR_EMULATE_PREPARES   => false,
		]);
	}

	public static function pdo(): PDO {
		self::init();
		return self::$pdo;
	}

	/** @return array<int,array<string,mixed>> */
	public static function rows(string $sql, array $params = []): array {
		$st = self::pdo()->prepare($sql);
		$st->execute(self::normalize($params));
		return $st->fetchAll();
	}

	/** @return array<string,mixed>|null */
	public static function row(string $sql, array $params = []): ?array {
		$st = self::pdo()->prepare($sql);
		$st->execute(self::normalize($params));
		$r = $st->fetch();
		return $r === false ? null : $r;
	}

	/** Erste Spalte der ersten Zeile (oder null). */
	public static function value(string $sql, array $params = []) {
		$st = self::pdo()->prepare($sql);
		$st->execute(self::normalize($params));
		$v = $st->fetchColumn();
		return $v === false ? null : $v;
	}

	/** Führt ein Statement aus und liefert die Anzahl betroffener Zeilen. */
	public static function execute(string $sql, array $params = []): int {
		$st = self::pdo()->prepare($sql);
		$st->execute(self::normalize($params));
		return $st->rowCount();
	}

	/**
	 * INSERT mit assoziativem Array. Gibt bei $returning die zurückgelieferte
	 * Spalte (Default: id), sonst die Anzahl betroffener Zeilen.
	 */
	public static function insert(string $table, array $data, string $returning = "id") {
		$cols = array_keys($data);
		$sql  = "INSERT INTO " . self::ident($table)
			. " (" . implode(", ", array_map([self::class, "ident"], $cols)) . ")"
			. " VALUES (" . implode(", ", array_map(fn($c) => ":" . $c, $cols)) . ")";
		if ($returning !== "") $sql .= " RETURNING " . self::ident($returning);

		$params = [];
		foreach ($data as $k => $v) $params[":" . $k] = $v;

		$st = self::pdo()->prepare($sql);
		$st->execute(self::normalize($params));
		return $returning !== "" ? $st->fetchColumn() : $st->rowCount();
	}

	/** PHP-Booleans zu Postgres-tauglichen Literalen normalisieren. */
	private static function normalize(array $params): array {
		foreach ($params as $k => $v) {
			if (is_bool($v)) $params[$k] = $v ? "true" : "false";
		}
		return $params;
	}

	private static function ident(string $name): string {
		return '"' . str_replace('"', "", $name) . '"';
	}
}
