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

	/** Vollständigkeit einer kanonischen AVefi-Struktur {work,manifestations,items}. */
	public static function forAvefi(array $c): int {
		$w = is_array($c["work"] ?? null) ? $c["work"] : [];
		$checks = [
			!self::emptyName($w["has_primary_title"] ?? null),          // Haupttitel
			!self::empty($w["type"] ?? null),                           // Werkart
			self::hasEventDate($w["has_event"] ?? null),                // Produktionsjahr
			!empty($w["has_subject"]),                                  // Schlagwörter/Personen/Orte
			self::hasActivities($w["has_event"] ?? null),               // Beteiligte
			!empty($w["has_genre"]) || !empty($w["has_form"]),          // Genre/Form
			!empty($c["manifestations"]),                               // ≥ 1 Manifestation
			!empty($c["items"]),                                        // ≥ 1 Exemplar
		];
		$filled = count(array_filter($checks));
		return (int)round($filled / count($checks) * 100);
	}

	/** Hinweise für den AVefi-Editor. @return array<int,array{level:string,text:string}> */
	public static function avefiIssues(array $c): array {
		$w = is_array($c["work"] ?? null) ? $c["work"] : [];
		$out = [];
		if (self::emptyName($w["has_primary_title"] ?? null)) $out[] = ["level" => "danger", "text" => "Haupttitel (has_primary_title) fehlt"];
		if (self::empty($w["type"] ?? null))                  $out[] = ["level" => "danger", "text" => "Werkart (type) fehlt"];
		if (!self::hasEventDate($w["has_event"] ?? null))     $out[] = ["level" => "warn", "text" => "Produktionsjahr/Ereignisdatum empfohlen"];
		if (empty($w["has_subject"]))                          $out[] = ["level" => "warn", "text" => "Schlagwörter/Personen (has_subject) empfohlen"];
		if (!self::hasActivities($w["has_event"] ?? null))    $out[] = ["level" => "warn", "text" => "Beteiligte (Regie o. Ä.) empfohlen"];
		if (empty($c["manifestations"]))                       $out[] = ["level" => "warn", "text" => "Keine Manifestation erfasst"];
		if (empty($c["items"]))                                $out[] = ["level" => "warn", "text" => "Kein Exemplar erfasst"];
		if (!$out) $out[] = ["level" => "ok", "text" => "Grunddaten vollständig"];
		return $out;
	}

	private static function emptyName($title): bool {
		return !(is_array($title) && trim((string)($title["has_name"] ?? "")) !== "");
	}
	private static function hasEventDate($events): bool {
		foreach ((is_array($events) ? $events : []) as $e) if (!self::empty($e["has_date"] ?? null)) return true;
		return false;
	}
	private static function hasActivities($events): bool {
		foreach ((is_array($events) ? $events : []) as $e) if (!empty($e["has_activity"])) return true;
		return false;
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
