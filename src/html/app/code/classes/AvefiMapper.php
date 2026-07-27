<?php
/*
 * AvefiMapper — Übersetzung zwischen dem internen Record-Format (Work + Manifestations
 * + Items, siehe RecordMapper) und dem echten AVefi-/LinkML-Schema
 * (WorkVariant / Manifestation / Item, html/schema/avefi/model.schema.json).
 *
 *   toAvefi(internerRecord, baseId): flaches AVefi-Record-Set
 *       [WorkVariant, Manifestation…, Item…] mit LocalResource-Verlinkung.
 *   fromAvefi(avefiArray): interne Records (native AVefi-Quelle → Editor/Records).
 *
 * PID-Verlinkung: solange keine echten Handle-PIDs vergeben sind, werden
 * is_manifestation_of / is_item_of über LocalResource-IDs verknüpft (schema-konform,
 * siehe LocalResource im Modell). Später kann PidService echte AVefiResource-PIDs setzen.
 */

class AvefiMapper {

	public const CLASS_BY_CATEGORY = [
		"avefi:WorkVariant"   => "WorkVariant",
		"avefi:Manifestation" => "Manifestation",
		"avefi:Item"          => "Item",
	];

	/* ============================ intern → AVefi ============================ */

	/**
	 * Erzeugt ein flaches AVefi-Record-Set aus einem internen Record.
	 * @return array<int,array<string,mixed>>  [WorkVariant, Manifestation…, Item…]
	 */
	public static function toAvefi(array $rec, string $baseId): array {
		$work   = is_array($rec["work"] ?? null) ? $rec["work"] : [];
		$manifs = is_array($rec["manifestations"] ?? null) ? $rec["manifestations"] : [];
		$items  = is_array($rec["items"] ?? null) ? $rec["items"] : [];

		$title  = trim((string)($work["title"] ?? ""));
		$workId = $baseId . "_work";

		$wv = [
			"category"          => "avefi:WorkVariant",
			"type"              => self::workType($work["work_type"] ?? null),
			"has_primary_title" => self::title($title, "PreferredTitle"),
			"has_identifier"    => [self::localRef($workId)],
		];
		$alt = self::altTitles($work["titles_additional"] ?? null);
		if ($alt)                            $wv["has_alternative_title"] = $alt;
		$year = self::edtf($work["year"] ?? null);
		$ev   = ["category" => "avefi:ProductionEvent"];
		if ($year !== null)                  $ev["has_date"] = $year;
		$activities = self::activities($work["contributors"] ?? null);
		if ($activities)                     $ev["has_activity"] = $activities;
		if ($year !== null || $activities)   $wv["has_event"] = [$ev];
		if (trim((string)($work["description"] ?? "")) !== "")
			$wv["has_note"] = [(string)$work["description"]];

		$out = [$wv];

		// Mindestens eine Manifestation, wenn Items vorhanden sind (Item braucht is_item_of).
		if (!$manifs && $items) $manifs = [[]];

		$manifIds = [];
		foreach (array_values($manifs) as $m => $mf) {
			$mf = is_array($mf) ? $mf : [];
			$mid = $baseId . "_manifestation" . ($m + 1);
			$manifIds[] = $mid;
			$mo = [
				"category"            => "avefi:Manifestation",
				"is_manifestation_of" => [self::localRef($workId)],
				"has_primary_title"   => self::title($title, "TitleProper"),
				"has_identifier"      => [self::localRef($mid)],
			];
			$md = self::edtf($mf["date"] ?? null);
			if ($md !== null) $mo["has_event"] = [["category" => "avefi:PublicationEvent", "type" => "ReleaseEvent", "has_date" => $md]];
			if (trim((string)($mf["note"] ?? "")) !== "") $mo["has_note"] = [(string)$mf["note"]];
			$out[] = $mo;
		}

		$firstManif = $manifIds[0] ?? null;
		$dur = self::durationOf($manifs);
		foreach (array_values($items) as $it => $item) {
			$item = is_array($item) ? $item : [];
			$iid  = $baseId . "_item" . ($it + 1);
			$io = [
				"category"          => "avefi:Item",
				"has_primary_title" => self::title($title, "TitleProper"),
				"has_identifier"    => [self::localRef($iid)],
			];
			if ($firstManif !== null) $io["is_item_of"] = self::localRef($firstManif);
			if ($dur !== null)        $io["has_duration"] = ["has_value" => $dur];
			$el = [];
			if (trim((string)($item["signature"] ?? "")) !== "")           $el["signature"] = $item["signature"];
			if (trim((string)($item["holding_institution"] ?? "")) !== "") $el["institution"] = $item["holding_institution"];
			// (Halterin/Signatur haben im Modell eigene Slots; hier als Notiz erhalten.)
			$notes = array_filter([
				$item["holding_institution"] ?? null,
				$item["signature"] ?? null,
				$item["location"] ?? null,
				$item["condition"] ?? null,
			], fn($v) => trim((string)$v) !== "");
			if ($notes) $io["has_note"] = [implode(" · ", $notes)];
			$out[] = $io;
		}

		return $out;
	}

	/**
	 * Wie toAvefi(), aber gruppiert nach Ebene: {work, manifestations[], items[]}.
	 * Das ist die kanonische, im Editor bearbeitete Struktur.
	 */
	public static function toAvefiGrouped(array $rec, string $baseId): array {
		return self::group(self::toAvefi($rec, $baseId));
	}

	/** Flaches AVefi-Set → {work, manifestations[], items[]}. */
	public static function group(array $set): array {
		$work = null; $manifs = []; $items = [];
		foreach ($set as $r) {
			if (!is_array($r)) continue;
			switch ($r["category"] ?? null) {
				case "avefi:WorkVariant":   if ($work === null) $work = $r; break;
				case "avefi:Manifestation": $manifs[] = $r; break;
				case "avefi:Item":          $items[]  = $r; break;
			}
		}
		return ["work" => $work ?? ["category" => "avefi:WorkVariant"], "manifestations" => $manifs, "items" => $items];
	}

	/** Kanonische {work,manifestations,items}-Struktur eines gespeicherten data_json. */
	public static function canonical(array $data, string $baseId = "rec"): array {
		if (isset($data["avefi"]) && is_array($data["avefi"]) && isset($data["avefi"]["work"])) {
			$a = $data["avefi"];
			return [
				"work"           => is_array($a["work"] ?? null) ? $a["work"] : ["category" => "avefi:WorkVariant"],
				"manifestations" => array_values(array_filter((array)($a["manifestations"] ?? []), "is_array")),
				"items"          => array_values(array_filter((array)($a["items"] ?? []), "is_array")),
			];
		}
		// Nativer Import: Original unter source.avefi.
		if (isset($data["source"]["avefi"]) && is_array($data["source"]["avefi"])) {
			$a = $data["source"]["avefi"];
			return [
				"work"           => is_array($a["work"] ?? null) ? $a["work"] : ["category" => "avefi:WorkVariant"],
				"manifestations" => array_values(array_filter((array)($a["manifestations"] ?? []), "is_array")),
				"items"          => array_values(array_filter((array)($a["items"] ?? []), "is_array")),
			];
		}
		// Alt-Format (internes Record) → nach AVefi migrieren.
		return self::toAvefiGrouped($data, $baseId);
	}

	/** Flaches Set aus einer kanonischen Struktur (für Validierung/Export). */
	public static function flatten(array $canonical): array {
		$out = [];
		if (is_array($canonical["work"] ?? null)) $out[] = $canonical["work"];
		foreach (($canonical["manifestations"] ?? []) as $m) if (is_array($m)) $out[] = $m;
		foreach (($canonical["items"] ?? []) as $it) if (is_array($it)) $out[] = $it;
		return $out;
	}

	/** Anzeige-Werte (Titel/Jahr/Typ) aus einem AVefi-WorkVariant. */
	public static function workDisplay(array $work): array {
		return [
			"title" => self::titleName($work["has_primary_title"] ?? null),
			"year"  => self::yearFromEvents($work["has_event"] ?? null),
			"type"  => is_string($work["type"] ?? null) ? $work["type"] : null,
		];
	}

	/* ============================ AVefi → intern ============================ */

	/**
	 * Wandelt ein natives AVefi-Record-Set in interne Records um (ein interner
	 * Record je WorkVariant, mit zugeordneten Manifestationen/Items).
	 * Das Original bleibt unter source.avefi erhalten (verlustfreier Passthrough).
	 * @return array<int,array<string,mixed>>
	 */
	public static function fromAvefi(array $data, string $sourceFile = ""): array {
		$list = self::recordList($data);
		$works = $manifs = $items = [];
		foreach ($list as $r) {
			if (!is_array($r)) continue;
			switch ($r["category"] ?? null) {
				case "avefi:WorkVariant":   $works[]  = $r; break;
				case "avefi:Manifestation": $manifs[] = $r; break;
				case "avefi:Item":          $items[]  = $r; break;
			}
		}
		// Index: LocalResource-ID → Manifestation.
		$manifById = [];
		foreach ($manifs as $mf) foreach (self::localIds($mf) as $id) $manifById[$id] = $mf;

		$out = [];
		$rowNum = 0;
		foreach ($works as $wv) {
			$rowNum++;
			$workIds = self::localIds($wv);
			$myManifs = array_values(array_filter($manifs, function ($mf) use ($workIds) {
				foreach (self::refIds($mf["is_manifestation_of"] ?? []) as $ref) if (in_array($ref, $workIds, true)) return true;
				return false;
			}));
			$manifLocalIds = [];
			foreach ($myManifs as $mf) $manifLocalIds = array_merge($manifLocalIds, self::localIds($mf));
			$myItems = array_values(array_filter($items, function ($it) use ($manifLocalIds) {
				foreach (self::refIds($it["is_item_of"] ?? []) as $ref) if (in_array($ref, $manifLocalIds, true)) return true;
				return false;
			}));

			$out[] = self::toInternal($wv, $myManifs, $myItems, $sourceFile, $rowNum);
		}

		// Kein WorkVariant vorhanden → jede Manifestation/jedes Item als eigenständiger Record,
		// damit nichts unsichtbar verloren geht.
		if (!$works) {
			foreach (array_merge($manifs, $items) as $r) {
				$rowNum++;
				$out[] = self::toInternal($r, [], [], $sourceFile, $rowNum);
			}
		}
		return $out;
	}

	private static function toInternal(array $wv, array $myManifs, array $myItems, string $sourceFile, int $rowNum): array {
		$work = [
			"title"             => self::titleName($wv["has_primary_title"] ?? null),
			"titles_additional" => self::altTitleNames($wv["has_alternative_title"] ?? null),
			"year"              => self::yearFromEvents($wv["has_event"] ?? null),
			"work_type"         => is_string($wv["type"] ?? null) ? $wv["type"] : null,
			"country"           => null,
			"genre"             => null,
			"language"          => null,
			"description"       => self::firstNote($wv["has_note"] ?? null),
			"contributors"      => self::contributorsFromEvents($wv["has_event"] ?? null),
		];
		$manifestations = [];
		foreach ($myManifs as $mf) {
			$manifestations[] = array_filter([
				"carrier"      => null,
				"date"         => self::yearFromEvents($mf["has_event"] ?? null),
				"note"         => self::firstNote($mf["has_note"] ?? null),
			], fn($v) => $v !== null && $v !== "");
		}
		$itemsOut = [];
		foreach ($myItems as $it) {
			$itemsOut[] = array_filter([
				"note" => self::firstNote($it["has_note"] ?? null),
			], fn($v) => $v !== null && $v !== "");
		}

		return [
			"work"           => array_filter($work, fn($v) => $v !== null && $v !== [] && $v !== ""),
			"manifestations" => $manifestations,
			"items"          => $itemsOut,
			"source"         => [
				"file"  => $sourceFile,
				"row"   => $rowNum,
				"avefi" => ["work" => $wv, "manifestations" => $myManifs, "items" => $myItems],
			],
		];
	}

	/* ============================ Validierung ============================ */

	/**
	 * Validiert ein AVefi-Record-Set gegen das echte Schema.
	 * @return array<int,array{index:int,class:?string,category:?string,errors:string[]}>
	 */
	public static function validateSet(array $data): array {
		$list = self::recordList($data);
		$res = [];
		foreach ($list as $i => $r) {
			if (!is_array($r)) { $res[] = ["index" => $i, "class" => null, "category" => null, "errors" => ["Record ist kein Objekt"]]; continue; }
			$cat = is_string($r["category"] ?? null) ? $r["category"] : null;
			$cls = $cat !== null ? (self::CLASS_BY_CATEGORY[$cat] ?? null) : null;
			$errors = $cls !== null
				? SchemaValidator::validateAvefi($r, $cls)
				: ["Unbekannte oder fehlende category" . ($cat !== null ? " („{$cat}“)" : "")];
			$res[] = ["index" => $i, "class" => $cls, "category" => $cat, "errors" => $errors];
		}
		return $res;
	}

	/* ============================ Helfer ============================ */

	/** Normalisiert eine AVefi-Quelle zu einer flachen Record-Liste. */
	public static function records($data): array {
		if (!is_array($data)) return [];
		if (array_is_list($data)) return $data;
		if (isset($data["has_record"]) && is_array($data["has_record"])) return $data["has_record"];
		return [$data];   // Einzelrecord als Objekt
	}
	private static function recordList($data): array { return self::records($data); }

	private static function localRef(string $id): array {
		return ["category" => "avefi:LocalResource", "id" => $id];
	}
	/** LocalResource-IDs aus has_identifier eines Records. */
	private static function localIds(array $rec): array {
		$ids = [];
		foreach (($rec["has_identifier"] ?? []) as $ident) {
			if (is_array($ident) && ($ident["category"] ?? null) === "avefi:LocalResource" && isset($ident["id"]))
				$ids[] = (string)$ident["id"];
		}
		return $ids;
	}
	/** Referenzierte IDs aus is_manifestation_of / is_item_of (Array oder Einzelobjekt). */
	private static function refIds($ref): array {
		$out = [];
		$list = (is_array($ref) && array_is_list($ref)) ? $ref : [$ref];
		foreach ($list as $r) if (is_array($r) && isset($r["id"])) $out[] = (string)$r["id"];
		return $out;
	}

	private static function title(string $name, string $type): array {
		return ["has_name" => $name, "type" => $type];
	}
	private static function titleName($t): ?string {
		if (is_array($t) && isset($t["has_name"]) && trim((string)$t["has_name"]) !== "") return (string)$t["has_name"];
		return null;
	}
	private static function altTitles($v): array {
		$list = is_array($v) ? $v : (is_string($v) && $v !== "" ? array_map("trim", explode(";", $v)) : []);
		$out = [];
		foreach ($list as $t) { $t = trim((string)$t); if ($t !== "") $out[] = self::title($t, "AlternativeTitle"); }
		return $out;
	}
	private static function altTitleNames($v): array {
		$out = [];
		foreach ((is_array($v) ? $v : []) as $t) { $n = self::titleName($t); if ($n !== null) $out[] = $n; }
		return $out;
	}

	/** Interner work_type → WorkVariantTypeEnum (Analytic/Collection/Monographic/Serial). */
	private static function workType($v): string {
		$s = mb_strtolower(trim((string)$v));
		if ($s === "") return "Monographic";
		if (str_contains($s, "seri"))                                   return "Serial";
		if (str_contains($s, "samml") || str_contains($s, "collection")) return "Collection";
		if (str_contains($s, "analyt") || str_contains($s, "beitrag"))   return "Analytic";
		return "Monographic";
	}

	/** Jahr/Datum → EDTF-tauglicher String (nur wenn ein Jahr erkennbar ist). */
	private static function edtf($v): ?string {
		if ($v === null || $v === "") return null;
		$s = trim((string)$v);
		if (preg_match('/^-?\d{4}(-\d{2}(-\d{2})?)?$/', $s)) return $s;   // schon ISO-artig
		if (preg_match('/(\d{4})/', $s, $m)) return $m[1];
		return null;
	}
	private static function yearFromEvents($events): ?int {
		foreach ((is_array($events) ? $events : []) as $ev) {
			if (is_array($ev) && isset($ev["has_date"]) && preg_match('/(\d{4})/', (string)$ev["has_date"], $m)) return (int)$m[1];
		}
		return null;
	}

	/** Interne contributors → ProductionEvent.has_activity (…Activity mit has_agent). */
	private static function activities($contribs): array {
		$out = [];
		foreach ((is_array($contribs) ? $contribs : []) as $c) {
			if (!is_array($c)) continue;
			$name = trim((string)($c["name"] ?? ""));
			if ($name === "") continue;
			[$cat, $type] = self::activityFor((string)($c["role"] ?? ""));
			$out[] = [
				"category"  => $cat,
				"type"      => $type,
				"has_agent" => [["category" => "avefi:Agent", "has_name" => $name]],
			];
		}
		return $out;
	}
	private static function activityFor(string $role): array {
		$r = mb_strtolower($role);
		if (str_contains($r, "regie") || str_contains($r, "direct")) return ["avefi:DirectingActivity", "Director"];
		if (str_contains($r, "kamera") || str_contains($r, "cinemat")) return ["avefi:CinematographyActivity", "Cinematographer"];
		if (str_contains($r, "musik") || str_contains($r, "music"))    return ["avefi:MusicActivity", "Composer"];
		if (str_contains($r, "buch") || str_contains($r, "writ") || str_contains($r, "drehbuch")) return ["avefi:WritingActivity", "Writer"];
		if (str_contains($r, "produ"))                                 return ["avefi:ProducingActivity", "Producer"];
		return ["avefi:DirectingActivity", "Director"];
	}
	private static function contributorsFromEvents($events): array {
		$out = [];
		foreach ((is_array($events) ? $events : []) as $ev) {
			foreach ((is_array($ev["has_activity"] ?? null) ? $ev["has_activity"] : []) as $act) {
				if (!is_array($act)) continue;
				$role   = self::roleFromActivity((string)($act["category"] ?? ""), (string)($act["type"] ?? ""));
				$agents = $act["has_agent"] ?? null;
				$agentList = (is_array($agents) && array_is_list($agents)) ? $agents : [$agents];
				foreach ($agentList as $agent) {
					$name = is_array($agent) ? trim((string)($agent["has_name"] ?? "")) : "";
					if ($name === "") continue;
					$out[] = ["role" => $role, "name" => $name];
				}
			}
		}
		return $out;
	}
	private static function roleFromActivity(string $category, string $type): string {
		$c = str_replace(["avefi:", "Activity"], "", $category);
		return $c !== "" ? mb_strtolower($c) : ($type !== "" ? mb_strtolower($type) : "beteiligt");
	}

	private static function firstNote($notes): ?string {
		foreach ((is_array($notes) ? $notes : (is_string($notes) ? [$notes] : [])) as $n) {
			$n = trim((string)$n); if ($n !== "") return $n;
		}
		return null;
	}

	/** Erste erkennbare Laufzeit (Minuten) aus internen Manifestationen → ISO-8601-Dauer. */
	private static function durationOf(array $manifs): ?string {
		foreach ($manifs as $mf) {
			if (is_array($mf) && isset($mf["duration_min"]) && (int)$mf["duration_min"] > 0) {
				$min = (int)$mf["duration_min"];
				return sprintf("PT%02dH%02dM00S", intdiv($min, 60), $min % 60);   // Duration-Pattern: PT..H..M..S
			}
		}
		return null;
	}
}
