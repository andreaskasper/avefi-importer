<?php
/*
 * FormatReview — offene Format-Reviews (unbekannter Fingerprint → Admin muss einen
 * Converter zuordnen bzw. ergänzen). Legt einen Eintrag an, falls noch keiner offen ist.
 */

class FormatReview {

	public static function open(string $importId, string $fingerprint, array $sample): int {
		$existing = DB::value(
			"SELECT id FROM format_reviews WHERE import_id = :iid AND status = 'open'",
			[":iid" => $importId]
		);
		if ($existing !== null) return (int)$existing;

		return (int)DB::insert("format_reviews", [
			"import_id"   => $importId,
			"fingerprint" => $fingerprint,
			"status"      => "open",
			"sample_json" => json_encode($sample, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
		], "id");
	}

	public static function countOpen(): int {
		return (int)DB::value("SELECT COUNT(*) FROM format_reviews WHERE status = 'open'");
	}

	/** Offene Reviews inkl. Import-/Institutions-Infos. @return array<int,array<string,mixed>> */
	public static function listOpen(): array {
		return DB::rows(
			"SELECT fr.*, i.filename, i.base_format, i.created_at AS uploaded_at, inst.name AS institution_name
			   FROM format_reviews fr
			   JOIN imports i ON i.id = fr.import_id
			   LEFT JOIN institutions inst ON inst.id = i.institution_id
			  WHERE fr.status = 'open'
			  ORDER BY fr.created_at DESC"
		);
	}

	/** Einzelnes Review inkl. Import-/Institutions-Infos. */
	public static function find(int $id): ?array {
		return DB::row(
			"SELECT fr.*, i.filename, i.base_format, i.created_at AS uploaded_at, inst.name AS institution_name
			   FROM format_reviews fr
			   JOIN imports i ON i.id = fr.import_id
			   LEFT JOIN institutions inst ON inst.id = i.institution_id
			  WHERE fr.id = :id",
			[":id" => $id]
		);
	}

	public static function setStatus(int $id, string $status): void {
		DB::execute("UPDATE format_reviews SET status = :s WHERE id = :id", [":s" => $status, ":id" => $id]);
	}
}
