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
			"SELECT i.*, fp.label AS profile_label
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
