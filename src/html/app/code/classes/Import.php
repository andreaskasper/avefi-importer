<?php
/*
 * Import — Entity für einen Datei-Upload und seinen Verarbeitungsstand.
 * id ist eine UUID (= Verzeichnisname unter /mnt/files/<id>/).
 */

class Import {

	/** @var array<string,mixed> */
	private array $row;

	private function __construct(array $row) { $this->row = $row; }

	public static function create(int $institutionId, ?int $userId, string $filename, int $filesize, ?string $baseFormat): self {
		$id = DB::insert("imports", [
			"institution_id"  => $institutionId,
			"user_id"         => $userId,
			"filename"        => $filename,
			"filesize"        => $filesize,
			"base_format"     => $baseFormat,
			"status"          => "uploading",
			"upload_progress" => 0,
		], "id");
		$import = self::byId((string)$id);
		if ($import === null) throw new \RuntimeException("Import konnte nicht angelegt werden.");
		return $import;
	}

	public static function byId(string $id): ?self {
		$r = DB::row("SELECT * FROM imports WHERE id = :id", [":id" => $id]);
		return $r ? new self($r) : null;
	}

	/** @return self[] */
	public static function forInstitution(int $institutionId): array {
		$rows = DB::rows(
			"SELECT i.*, fp.label AS profile_label, fp.converter_key AS converter_key
			   FROM imports i
			   LEFT JOIN format_profiles fp ON fp.id = i.format_profile_id
			  WHERE i.institution_id = :iid
			  ORDER BY i.created_at DESC
			  LIMIT 200",
			[":iid" => $institutionId]
		);
		return array_map(fn($r) => new self($r), $rows);
	}

	public static function countRecordsForInstitution(int $institutionId): int {
		return (int)DB::value(
			"SELECT COUNT(*) FROM records r JOIN imports i ON i.id = r.import_id WHERE i.institution_id = :iid",
			[":iid" => $institutionId]
		);
	}

	public static function countAwaitingForInstitution(int $institutionId): int {
		return (int)DB::value(
			"SELECT COUNT(*) FROM imports WHERE institution_id = :iid AND status = 'awaiting_format_review'",
			[":iid" => $institutionId]
		);
	}

	public function id(): string          { return (string)$this->row["id"]; }
	public function institutionId(): int  { return (int)$this->row["institution_id"]; }
	public function filename(): string    { return (string)$this->row["filename"]; }
	public function filesize(): int       { return (int)$this->row["filesize"]; }
	public function baseFormat(): ?string { return $this->row["base_format"] !== null ? (string)$this->row["base_format"] : null; }
	public function status(): string      { return (string)$this->row["status"]; }
	public function uploadProgress(): int { return (int)$this->row["upload_progress"]; }
	public function recordCount(): int    { return (int)$this->row["record_count"]; }
	public function profileLabel(): ?string {
		return isset($this->row["profile_label"]) && $this->row["profile_label"] !== null ? (string)$this->row["profile_label"] : null;
	}
	public function createdAt(): ?string  { return $this->row["created_at"] !== null ? (string)$this->row["created_at"] : null; }

	/**
	 * converter_key des zugeordneten Format-Profils (oder null, wenn noch keines
	 * zugeordnet ist — dann gibt es nichts zu wiederholen). Kommt bei forInstitution()
	 * schon aus dem JOIN, sonst wird nachgeladen.
	 */
	public function mappingProfileId(): ?int {
		$v = $this->row["mapping_profile_id"] ?? null;
		return $v !== null ? (int)$v : null;
	}

	public function setMappingProfile(int $profileId, int $version): void {
		self::tolerant("UPDATE imports SET mapping_profile_id = :p, mapping_version = :v WHERE id = :id",
			[":p" => $profileId, ":v" => $version, ":id" => $this->id()]);
		$this->row["mapping_profile_id"] = $profileId;
		$this->row["mapping_version"]    = $version;
	}

	public function headerHash(): ?string {
		$v = $this->row["header_hash"] ?? null;
		return ($v !== null && $v !== "") ? (string)$v : null;
	}

	public function setHeaderHash(string $hash): void {
		self::tolerant("UPDATE imports SET header_hash = :h WHERE id = :id", [":h" => $hash, ":id" => $this->id()]);
		$this->row["header_hash"] = $hash;
	}

	/** Läuft dieser Import über ein Mapping-Profil (tabellarische Quelle)? */
	public function usesMapping(): bool {
		return TableHeader::isTabular($this->baseFormat());
	}

	public function converterKey(): ?string {
		// Ein zugeordnetes Mapping-Profil hat Vorrang vor dem Code-Converter.
		$mp = $this->mappingProfileId();
		if ($mp !== null) return "mapping_profile:" . $mp;

		if (array_key_exists("converter_key", $this->row)) {
			$v = $this->row["converter_key"];
			return ($v !== null && $v !== "") ? (string)$v : null;
		}
		$pid = $this->row["format_profile_id"] ?? null;
		if ($pid === null) return null;
		$v = DB::value("SELECT converter_key FROM format_profiles WHERE id = :id", [":id" => (int)$pid]);
		$this->row["converter_key"] = $v;
		return ($v !== null && $v !== "") ? (string)$v : null;
	}

	/** Kann dieser Import erneut konvertiert werden? */
	public function canReconvert(): bool {
		return $this->converterKey() !== null
			&& in_array($this->status(), ["converted", "error", "converting"], true);
	}

	/**
	 * import_id => Anzahl von Hand bearbeiteter Datensätze, für alle Importe einer
	 * Institution in einer Abfrage (kein N+1). Leeres Array, falls edited_at fehlt.
	 */
	public static function editedCounts(int $institutionId): array {
		try {
			$rows = DB::rows(
				"SELECT r.import_id, COUNT(*) AS n
				   FROM records r JOIN imports i ON i.id = r.import_id
				  WHERE i.institution_id = :iid AND r.edited_at IS NOT NULL
				  GROUP BY r.import_id",
				[":iid" => $institutionId]
			);
		} catch (\Throwable $e) {
			return [];
		}
		$out = [];
		foreach ($rows as $r) $out[(string)$r["import_id"]] = (int)$r["n"];
		return $out;
	}

	/** Erkanntes Format/Schema-Label (Badge); Fallback: Basisformat. */
	public function detectedFormat(): ?string {
		$v = $this->row["detected_format"] ?? null;
		return $v !== null && $v !== "" ? (string)$v : null;
	}
	public function setDetectedFormat(string $label): void {
		self::tolerant("UPDATE imports SET detected_format = :d WHERE id = :id", [":d" => $label, ":id" => $this->id()]);
		$this->row["detected_format"] = $label;
	}

	/**
	 * Für optionale Zusatz-Spalten (report_json/detected_format): schluckt Fehler,
	 * falls die Spalte auf einer noch nicht migrierten DB fehlt — die Kern-
	 * Verarbeitung soll dadurch nicht scheitern. Migration: bot -t migrate.
	 */
	private static function tolerant(string $sql, array $params): void {
		try {
			DB::execute($sql, $params);
		} catch (\Throwable $e) {
			error_log("[Import] Zusatzspalte nicht beschreibbar (Migration ausstehend?): " . $e->getMessage());
		}
	}

	/** [Badge-Klasse, Label] für den aktuellen Status. */
	public function statusBadge(): array {
		switch ($this->status()) {
			case "uploading":              return ["b-neutral", "Lädt hoch"];
			case "queued":                 return ["b-neutral", "Wartend"];
			case "awaiting_format_review": return ["b-wait",    "Neues Format – Review nötig"];
			case "converting":             return ["b-info",    "In Konvertierung"];
			case "converted":              return ["b-ok",      "Konvertiert"];
			case "error":                  return ["b-danger",  "Fehler"];
			default:                       return ["b-neutral", $this->status()];
		}
	}

	public function setStatus(string $status, ?int $progress = null): void {
		if ($progress === null) {
			DB::execute("UPDATE imports SET status = :s WHERE id = :id", [":s" => $status, ":id" => $this->id()]);
		} else {
			DB::execute("UPDATE imports SET status = :s, upload_progress = :p WHERE id = :id",
				[":s" => $status, ":p" => $progress, ":id" => $this->id()]);
			$this->row["upload_progress"] = $progress;
		}
		$this->row["status"] = $status;
	}

	public function setStoragePath(string $path): void {
		DB::execute("UPDATE imports SET storage_path = :p WHERE id = :id", [":p" => $path, ":id" => $this->id()]);
	}

	public function setFile(string $filename, int $filesize, ?string $baseFormat): void {
		DB::execute("UPDATE imports SET filename = :f, filesize = :s, base_format = :b WHERE id = :id",
			[":f" => $filename, ":s" => $filesize, ":b" => $baseFormat, ":id" => $this->id()]);
		$this->row["filename"]    = $filename;
		$this->row["filesize"]    = $filesize;
		$this->row["base_format"] = $baseFormat;
	}

	public function setFingerprint(string $fp): void {
		DB::execute("UPDATE imports SET fingerprint = :f WHERE id = :id", [":f" => $fp, ":id" => $this->id()]);
		$this->row["fingerprint"] = $fp;
	}

	public function setFormatProfile(int $profileId): void {
		DB::execute("UPDATE imports SET format_profile_id = :p WHERE id = :id", [":p" => $profileId, ":id" => $this->id()]);
		$this->row["format_profile_id"] = $profileId;
	}

	/** Parse-/Validierungsbericht (Fehlerreport) als JSON ablegen. */
	public function setReport(array $report): void {
		$json = json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		self::tolerant("UPDATE imports SET report_json = :r WHERE id = :id", [":r" => $json, ":id" => $this->id()]);
		$this->row["report_json"] = $json;
	}

	/** Bericht als Array (oder null). */
	public function report(): ?array {
		$raw = $this->row["report_json"] ?? null;
		if ($raw === null || $raw === "") return null;
		$r = json_decode((string)$raw, true);
		return is_array($r) ? $r : null;
	}

	/** Hat der Import einen Bericht mit Beanstandungen? */
	public function hasReportIssues(): bool {
		$r = $this->report();
		if ($r === null) return false;
		return !empty($r["parse_errors"]) || (int)($r["summary"]["invalid"] ?? 0) > 0 || (int)($r["summary"]["row_errors"] ?? 0) > 0;
	}

	public function setCounts(int $records, int $errors): void {
		DB::execute("UPDATE imports SET record_count = :r, error_count = :e WHERE id = :id",
			[":r" => $records, ":e" => $errors, ":id" => $this->id()]);
		$this->row["record_count"] = $records;
		$this->row["error_count"]  = $errors;
	}

	public function delete(): void {
		DB::execute("DELETE FROM imports WHERE id = :id", [":id" => $this->id()]);
	}
}
