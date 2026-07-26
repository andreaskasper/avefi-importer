<?php
/*
 * Completeness — Vollständigkeit eines Records (0–100).
 * Anteil ausgefüllter Pflicht- + empfohlener Felder (Wireframe-Definition).
 *
 * TODO: sobald das av-efi-schema-JSON-Schema vorliegt, hier gegen die echten
 * required/recommended-Slots der LinkML-Klassen rechnen (opis/json-schema).
 */

class Completeness {

	public static function forRecord(array $data): int {
		$w = $data["work"] ?? [];

		$required    = ["title", "year", "work_type"];
		$recommended = ["country", "genre", "language", "description"];
		$total = count($required) + count($recommended) + 3;   // + contributors + manifestation + item
		$filled = 0;

		foreach ($required as $f)    if (!self::empty($w[$f] ?? null)) $filled++;
		foreach ($recommended as $f) if (!self::empty($w[$f] ?? null)) $filled++;

		if (!empty($w["contributors"])) $filled++;

		$m = $data["manifestations"] ?? [];
		if (!empty($m) && !self::empty($m[0]["carrier"] ?? null)) $filled++;

		$i = $data["items"] ?? [];
		if (!empty($i) && !self::empty($i[0]["holding_institution"] ?? null)) $filled++;

		return (int)round($filled / $total * 100);
	}

	/** CSS-Klasse für den Fortschrittsring: low (<50), mid (<80), sonst grün. */
	public static function ringClass(int $pct): string {
		if ($pct < 50) return "low";
		if ($pct < 80) return "mid";
		return "";
	}

	/**
	 * Liste von Validierungshinweisen für den Editor.
	 * @return array<int,array{level:string,text:string}>
	 */
	public static function issues(array $data): array {
		$w = $data["work"] ?? [];
		$out = [];

		$required = ["title" => "Haupttitel", "year" => "Produktionsjahr", "work_type" => "Werkart"];
		$missing = [];
		foreach ($required as $k => $lab) if (self::empty($w[$k] ?? null)) $missing[] = $lab;
		if ($missing) {
			foreach ($missing as $lab) $out[] = ["level" => "danger", "text" => "Pflichtfeld „" . $lab . "“ fehlt"];
		} else {
			$out[] = ["level" => "ok", "text" => "Pflichtfelder Werk vollständig"];
		}

		$recommended = ["country" => "Herstellungsland", "genre" => "Genre", "language" => "Sprache", "description" => "Beschreibung"];
		foreach ($recommended as $k => $lab) {
			if (self::empty($w[$k] ?? null)) $out[] = ["level" => "warn", "text" => $lab . " empfohlen, fehlt"];
		}
		if (empty($w["contributors"])) $out[] = ["level" => "warn", "text" => "Keine Beteiligten erfasst"];

		if (empty($data["manifestations"] ?? [])) {
			$out[] = ["level" => "warn", "text" => "Keine Manifestation erfasst"];
		}
		foreach (($data["items"] ?? []) as $idx => $it) {
			if (self::empty($it["location"] ?? null)) {
				$out[] = ["level" => "warn", "text" => "Exemplar " . ($idx + 1) . " ohne Standort"];
			}
		}
		return $out;
	}

	private static function empty($v): bool {
		return $v === null || $v === "" || $v === [];
	}
}
