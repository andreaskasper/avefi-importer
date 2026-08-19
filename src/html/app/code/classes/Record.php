<?php
/*
 * Record — ein erzeugter AVefi-Record (Work + Manifestations + Items).
 * Das vollständige Objekt liegt in data_json; Listenfelder sind denormalisiert.
 */

class Record {

	/** Legt einen Record an und liefert die completeness-Berechnung. */
	public static function create(string $importId, array $data, ?int $completeness = null): int {
		$work = $data["work"] ?? [];
		$comp = $completeness ?? Completeness::forRecord($data);

		return (int)DB::insert("records", [
			"import_id"           => $importId,
			"work_title"          => $work["title"] ?? null,
			"work_year"           => isset($work["year"]) && $work["year"] !== null ? (int)$work["year"] : null,
			"work_type"           => $work["work_type"] ?? null,
			"manifestation_count" => count($data["manifestations"] ?? []),
			"item_count"          => count($data["items"] ?? []),
			"completeness"        => $comp,
			"data_json"           => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
			"source_row"          => $data["source"]["row"] ?? null,
		], "id");
	}

	/** @return array<int,array<string,mixed>> */
	public static function forImport(string $importId): array {
		return DB::rows(
			"SELECT * FROM records WHERE import_id = :iid ORDER BY id",
			[":iid" => $importId]
		);
	}

	/**
	 * Markiert einen Datensatz als von Hand bearbeitet. Tolerant gegenüber einer
	 * noch nicht migrierten DB (Spalte edited_at fehlt) — Speichern soll daran
	 * nicht scheitern. Migration: bot -t migrate.
	 */
	public static function markEdited(int $id, string $importId): void {
		try {
			DB::execute("UPDATE records SET edited_at = now() WHERE id = :id AND import_id = :iid",
				[":id" => $id, ":iid" => $importId]);
		} catch (\Throwable $e) {
			error_log("[Record] edited_at nicht schreibbar (Migration ausstehend?): " . $e->getMessage());
		}
	}

	/** Anzahl der von Hand bearbeiteten Datensätze eines Imports (0, falls Spalte fehlt). */
	public static function countEdited(string $importId): int {
		try {
			return (int)DB::value("SELECT COUNT(*) FROM records WHERE import_id = :iid AND edited_at IS NOT NULL",
				[":iid" => $importId]);
		} catch (\Throwable $e) {
			return 0;
		}
	}

	/** Einzelner Record, auf den Import eingegrenzt. */
	public static function find(int $id, string $importId): ?array {
		return DB::row("SELECT * FROM records WHERE id = :id AND import_id = :iid", [":id" => $id, ":iid" => $importId]);
	}

	/**
	 * Speichert die kanonische AVefi-Struktur ($store enthält avefi+source) und
	 * pflegt die denormalisierten Spalten aus $disp (Titel/Jahr/Typ) + $canonical.
	 */
	public static function saveAvefi(int $id, string $importId, array $store, array $disp, array $canonical, int $completeness): void {
		DB::execute(
			"UPDATE records SET work_title = :t, work_year = :y, work_type = :wt,
			        manifestation_count = :mc, item_count = :ic, completeness = :c, data_json = :d
			  WHERE id = :id AND import_id = :iid",
			[
				":t"  => $disp["title"] ?? null,
				":y"  => isset($disp["year"]) && $disp["year"] !== null ? (int)$disp["year"] : null,
				":wt" => $disp["type"] ?? null,
				":mc" => count($canonical["manifestations"] ?? []),
				":ic" => count($canonical["items"] ?? []),
				":c"  => $completeness,
				":d"  => json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
				":id" => $id, ":iid" => $importId,
			]
		);
	}

	/** Aktualisiert Record + denormalisierte Felder. */
	public static function save(int $id, string $importId, array $data, int $completeness): void {
		$work = $data["work"] ?? [];
		DB::execute(
			"UPDATE records SET work_title = :t, work_year = :y, work_type = :wt,
			        manifestation_count = :mc, item_count = :ic, completeness = :c, data_json = :d
			  WHERE id = :id AND import_id = :iid",
			[
				":t"  => $work["title"] ?? null,
				":y"  => isset($work["year"]) && $work["year"] !== null ? (int)$work["year"] : null,
				":wt" => $work["work_type"] ?? null,
				":mc" => count($data["manifestations"] ?? []),
				":ic" => count($data["items"] ?? []),
				":c"  => $completeness,
				":d"  => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
				":id" => $id,
				":iid" => $importId,
			]
		);
	}
}
