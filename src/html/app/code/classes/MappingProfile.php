<?php
/*
 * MappingProfile — gespeicherte Spaltenzuordnung für eine Kopfzeile (header_hash).
 *
 * Profile sind global sichtbar, die Auflösung hat aber eine Rangfolge: das Profil
 * der eigenen Institution schlägt jedes fremde. Fremde Profile werden zum KOPIEREN
 * angeboten, nicht referenziert — sonst würde eine Änderung bei Institution B
 * stillschweigend die Importe von Institution A verändern.
 *
 * mapping_json (Version 1):
 *   {
 *     "version": 1,
 *     "columns": {
 *       "Haupttitel": {"pre":[{"op":"trim"}],
 *                      "targets":[{"target":"work.title.primary","post":[]}]},
 *       "Notiz":      {"ignore": true}
 *     },
 *     "defaults":  [{"target":"item.identifier.local","value":"…"}],
 *     "row":       {"represents":"item"},
 *     "grouping":  {"work":{"by":[]}, "manifestation":{"by":[]}}
 *   }
 */

class MappingProfile {

	private array $row;
	private function __construct(array $row) { $this->row = $row; }

	/* ---------------- Finden ---------------- */

	public static function byId(int $id): ?self {
		$r = DB::row("SELECT * FROM mapping_profiles WHERE id = :id", [":id" => $id]);
		return $r ? new self($r) : null;
	}

	/** Das Profil der eigenen Institution für diese Kopfzeile (oder null). */
	public static function findOwn(int $institutionId, string $hash): ?self {
		$r = DB::row(
			"SELECT * FROM mapping_profiles WHERE institution_id = :i AND header_hash = :h",
			[":i" => $institutionId, ":h" => $hash]
		);
		return $r ? new self($r) : null;
	}

	/**
	 * Fremde Profile mit derselben Kopfzeile — Angebot „Profil von X laden".
	 * @return array<int,array<string,mixed>>  inkl. institution_name
	 */
	public static function othersForHash(string $hash, int $excludeInstitutionId): array {
		return DB::rows(
			"SELECT p.id, p.name, p.version, p.complete, p.updated_at, inst.name AS institution_name
			   FROM mapping_profiles p
			   LEFT JOIN institutions inst ON inst.id = p.institution_id
			  WHERE p.header_hash = :h AND p.institution_id <> :i
			  ORDER BY p.complete DESC, p.updated_at DESC",
			[":h" => $hash, ":i" => $excludeInstitutionId]
		);
	}

	/**
	 * Alle Profile für die Übersichtsseite; eigene zuerst.
	 * @return array<int,array<string,mixed>>
	 */
	public static function listAll(int $ownInstitutionId): array {
		return DB::rows(
			"SELECT p.*, inst.name AS institution_name, u.name AS user_name,
			        (p.institution_id = :i) AS is_own,
			        (SELECT COUNT(*) FROM imports im WHERE im.mapping_profile_id = p.id) AS use_count
			   FROM mapping_profiles p
			   LEFT JOIN institutions inst ON inst.id = p.institution_id
			   LEFT JOIN users u ON u.id = p.created_by_user_id
			  ORDER BY (p.institution_id = :i) DESC, p.updated_at DESC",
			[":i" => $ownInstitutionId]
		);
	}

	/* ---------------- Anlegen und Speichern ---------------- */

	public static function create(int $institutionId, ?int $userId, string $hash, string $baseFormat,
	                              string $name, array $mapping, ?int $derivedFromId = null): self {
		$id = DB::insert("mapping_profiles", [
			"institution_id"     => $institutionId,
			"created_by_user_id" => $userId,
			"header_hash"        => $hash,
			"base_format"        => $baseFormat,
			"name"               => $name,
			"mapping_json"       => self::encode($mapping),
			"version"            => 1,
			"complete"           => self::computeComplete($mapping) ? "true" : "false",
			"derived_from_id"    => $derivedFromId,
		], "id");
		$p = self::byId((int)$id);
		if ($p === null) throw new \RuntimeException("Profil konnte nicht angelegt werden.");
		$p->writeHistory($userId);
		return $p;
	}

	/** Speichert eine neue Fassung und erhöht die Version. */
	public function update(array $mapping, ?string $name, ?int $userId): void {
		$name = ($name !== null && trim($name) !== "") ? trim($name) : $this->name();
		$next = $this->version() + 1;
		DB::execute(
			"UPDATE mapping_profiles
			    SET mapping_json = :m, name = :n, version = :v, complete = :c, updated_at = now()
			  WHERE id = :id",
			[":m" => self::encode($mapping), ":n" => $name, ":v" => $next,
			 ":c" => self::computeComplete($mapping) ? "true" : "false", ":id" => $this->id()]
		);
		$this->row["mapping_json"] = self::encode($mapping);
		$this->row["name"]         = $name;
		$this->row["version"]      = $next;
		$this->row["complete"]     = self::computeComplete($mapping);
		$this->writeHistory($userId);
	}

	private function writeHistory(?int $userId): void {
		try {
			DB::insert("mapping_profile_versions", [
				"profile_id"   => $this->id(),
				"version"      => $this->version(),
				"name"         => $this->name(),
				"mapping_json" => self::encode($this->mapping()),
				"user_id"      => $userId,
			], "id");
		} catch (\Throwable $e) {
			error_log("[MappingProfile] Verlauf nicht schreibbar: " . $e->getMessage());
		}
	}

	/** @return array<int,array<string,mixed>> */
	public function versions(): array {
		return DB::rows(
			"SELECT v.id, v.version, v.name, v.created_at, u.name AS user_name
			   FROM mapping_profile_versions v
			   LEFT JOIN users u ON u.id = v.user_id
			  WHERE v.profile_id = :p ORDER BY v.version DESC",
			[":p" => $this->id()]
		);
	}

	public function versionMapping(int $version): ?array {
		$raw = DB::value("SELECT mapping_json FROM mapping_profile_versions WHERE profile_id = :p AND version = :v",
			[":p" => $this->id(), ":v" => $version]);
		if ($raw === null) return null;
		$m = json_decode((string)$raw, true);
		return is_array($m) ? $m : null;
	}

	public function rename(string $name): void {
		$name = trim($name);
		if ($name === "") return;
		DB::execute("UPDATE mapping_profiles SET name = :n, updated_at = now() WHERE id = :id",
			[":n" => $name, ":id" => $this->id()]);
		$this->row["name"] = $name;
	}

	public function delete(): void {
		DB::execute("DELETE FROM mapping_profiles WHERE id = :id", [":id" => $this->id()]);
	}

	/* ---------------- Zugriff ---------------- */

	public function id(): int              { return (int)$this->row["id"]; }
	public function institutionId(): int   { return (int)$this->row["institution_id"]; }
	public function headerHash(): string   { return (string)$this->row["header_hash"]; }
	public function baseFormat(): string   { return (string)$this->row["base_format"]; }
	public function name(): string         { return (string)$this->row["name"]; }
	public function version(): int         { return (int)$this->row["version"]; }
	public function isComplete(): bool     { return self::truthy($this->row["complete"] ?? false); }
	public function createdBy(): ?int      { return $this->row["created_by_user_id"] !== null ? (int)$this->row["created_by_user_id"] : null; }
	public function updatedAt(): ?string   { return $this->row["updated_at"] !== null ? (string)$this->row["updated_at"] : null; }

	public function mapping(): array {
		$m = json_decode((string)($this->row["mapping_json"] ?? "{}"), true);
		return is_array($m) ? $m : [];
	}

	/* ---------------- Hilfen ---------------- */

	/** Vorschlag für den Profilnamen beim ersten Speichern. */
	public static function suggestName(?string $institutionName, string $filename): string {
		$base = preg_replace('/\.[A-Za-z0-9]{1,6}$/', "", $filename) ?? $filename;
		$base = trim($base);
		if ($base === "") $base = "Tabelle";
		return trim(($institutionName !== null && $institutionName !== "" ? $institutionName . " · " : "") . $base);
	}

	/** Leeres Mapping-Gerüst für eine frisch erkannte Kopfzeile. */
	public static function emptyMapping(array $columns): array {
		$cols = [];
		foreach ($columns as $c) $cols[(string)$c] = ["pre" => [], "targets" => []];
		return [
			"version"  => 1,
			"columns"  => $cols,
			"defaults" => [],
			"row"      => ["represents" => "item"],
			"grouping" => ["work" => ["by" => []], "manifestation" => ["by" => []]],
		];
	}

	/**
	 * Vollständig ist ein Profil, wenn keine Spalte mehr unbeantwortet ist: jede
	 * Spalte ist entweder gemappt oder ausdrücklich ignoriert. Der dritte Zustand
	 * — „noch nicht angefasst" — ist der eigentliche Grund für dieses Flag.
	 */
	public static function computeComplete(array $mapping): bool {
		$cols = $mapping["columns"] ?? [];
		if (!is_array($cols) || !$cols) return false;
		$anyTarget = false;
		foreach ($cols as $spec) {
			if (!is_array($spec)) return false;
			$ignored = !empty($spec["ignore"]);
			$targets = is_array($spec["targets"] ?? null) ? $spec["targets"] : [];
			if (!$ignored && !$targets) return false;
			if ($targets) $anyTarget = true;
		}
		return $anyTarget;
	}

	/** Spalten ohne Entscheidung (für die Anzeige „noch offen"). */
	public static function openColumns(array $mapping): array {
		$out = [];
		foreach (($mapping["columns"] ?? []) as $name => $spec) {
			if (!is_array($spec)) { $out[] = (string)$name; continue; }
			if (empty($spec["ignore"]) && empty($spec["targets"])) $out[] = (string)$name;
		}
		return $out;
	}

	/**
	 * Übernimmt ein fremdes Mapping auf die eigene Spaltenliste. Spalten, die es
	 * hier nicht gibt, fallen weg; hiesige Spalten ohne Entsprechung bleiben offen.
	 * @return array{mapping:array,matched:string[],missing:string[],extra:string[]}
	 */
	public static function adopt(array $foreignMapping, array $columns): array {
		$fc = is_array($foreignMapping["columns"] ?? null) ? $foreignMapping["columns"] : [];
		$byNorm = [];
		foreach ($fc as $name => $spec) $byNorm[TableHeader::normalize((string)$name)] = $spec;

		$out = self::emptyMapping($columns);
		$matched = []; $missing = [];
		foreach ($columns as $c) {
			$k = TableHeader::normalize((string)$c);
			if (isset($byNorm[$k]) && is_array($byNorm[$k])) {
				$out["columns"][(string)$c] = $byNorm[$k];
				$matched[] = (string)$c;
				unset($byNorm[$k]);
			} else {
				$missing[] = (string)$c;
			}
		}
		foreach (["defaults", "row", "grouping"] as $k) {
			if (isset($foreignMapping[$k])) $out[$k] = $foreignMapping[$k];
		}
		return [
			"mapping" => $out,
			"matched" => $matched,
			"missing" => $missing,
			"extra"   => array_keys($byNorm),
		];
	}

	/**
	 * Feldvorschläge aus fremden Profilen: gleichnamige Spalten sind ein Indiz,
	 * auch wenn die Kopfzeile insgesamt nicht passt.
	 * @return array<string,array<int,array{target:string,count:int}>>  Spalte => Ziele
	 */
	public static function targetHints(array $columns, int $excludeInstitutionId): array {
		$rows = DB::rows(
			"SELECT mapping_json FROM mapping_profiles WHERE institution_id <> :i AND complete = true LIMIT 200",
			[":i" => $excludeInstitutionId]
		);
		$want = [];
		foreach ($columns as $c) $want[TableHeader::normalize((string)$c)] = (string)$c;

		$tally = [];
		foreach ($rows as $r) {
			$m = json_decode((string)$r["mapping_json"], true);
			foreach (($m["columns"] ?? []) as $name => $spec) {
				$k = TableHeader::normalize((string)$name);
				if (!isset($want[$k]) || !is_array($spec)) continue;
				foreach (($spec["targets"] ?? []) as $t) {
					$key = (string)($t["target"] ?? "");
					if ($key === "") continue;
					$tally[$want[$k]][$key] = ($tally[$want[$k]][$key] ?? 0) + 1;
				}
			}
		}
		$out = [];
		foreach ($tally as $col => $targets) {
			arsort($targets);
			foreach (array_slice($targets, 0, 3, true) as $t => $n) {
				$out[$col][] = ["target" => $t, "count" => $n];
			}
		}
		return $out;
	}

	private static function encode(array $m): string {
		return json_encode($m, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	}

	/** Postgres liefert booleans je nach Treiber als bool, "t" oder "1". */
	private static function truthy($v): bool {
		return $v === true || $v === 1 || $v === "1" || $v === "t" || $v === "true";
	}
}
