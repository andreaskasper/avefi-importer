<?php
/*
 * AuthorityLookup — proaktive Normdaten-Vorschläge für den Editor.
 * Fragt (serverseitig, CORS-frei) GND (lobid.org), Wikidata und VIAF ab und liefert
 * normalisierte Treffer. Welche Quellen bei welchem Feld erlaubt sind, ergibt sich
 * schema-getrieben aus SchemaModel::sameAsTypes() der jeweiligen Ziel-Klasse.
 *
 *   search($q, $kind): [ ["source","id","label","description","category","resourceType","uri"], … ]
 *   kind ∈ subject|person|corporate|place|genre|work
 */

class AuthorityLookup {

	/** kind → [AVefi-Klasse, GND-Typ-Filter (Teilstring in type[]) oder null, VIAF-nametype oder null]. */
	private const KIND = [
		"subject"   => ["Subject",        "SubjectHeading", null],
		"person"    => ["Agent",          "Person",         "personal"],
		"corporate" => ["Agent",          "CorporateBody",  "corporate"],
		"place"     => ["GeographicName",  "Geographic",     "geographic"],
		"genre"     => ["Genre",           "SubjectHeading", null],
		"work"      => ["WorkVariant",     null,             "uniformtitle"],
	];

	/** Aktiv live abfragbare Quellen: Resource-Typ → interner Quell-Key. */
	private const ACTIVE = [
		"GNDResource"      => "gnd",
		"WikidataResource" => "wikidata",
		"VIAFResource"     => "viaf",
	];

	private const UA = "AVefiImporter/1.0 (+https://avefiimporter.goo1.de)";

	public static function search(string $q, string $kind, ?array $sources = null): array {
		$q = trim($q);
		if (mb_strlen($q) < 2) return [];
		$kind  = isset(self::KIND[$kind]) ? $kind : "subject";
		$class = self::KIND[$kind][0];
		$allowed = SchemaModel::sameAsTypes($class);   // erlaubte Resource-Typen laut Schema

		$results = [];
		foreach (self::ACTIVE as $resType => $srcKey) {
			if (!in_array($resType, $allowed, true)) continue;             // Schema-Gating
			if ($sources !== null && !in_array($srcKey, $sources, true)) continue;
			try {
				$results = array_merge($results, self::{$srcKey}($q, $kind));
			} catch (\Throwable $e) {
				error_log("[AuthorityLookup] {$srcKey} fehlgeschlagen: " . $e->getMessage());
			}
		}
		return array_slice($results, 0, 30);
	}

	/** Erlaubte (aktive) Quellen für einen Feld-kind – fürs Frontend. */
	public static function sourcesForKind(string $kind): array {
		$class = self::KIND[$kind][0] ?? "Subject";
		$allowed = SchemaModel::sameAsTypes($class);
		$out = [];
		foreach (self::ACTIVE as $resType => $srcKey) if (in_array($resType, $allowed, true)) $out[] = $srcKey;
		return $out;
	}

	/* ---------------- GND (lobid.org) ---------------- */

	private static function gnd(string $q, string $kind): array {
		$typeNeedle = self::KIND[$kind][1] ?? null;
		$j = self::get("https://lobid.org/gnd/search?format=json&size=10&q=" . rawurlencode($q));
		$out = [];
		foreach (($j["member"] ?? []) as $m) {
			$types = array_map("strval", (array)($m["type"] ?? []));
			if ($typeNeedle !== null && !self::typeMatches($types, $typeNeedle)) continue;
			$id = (string)($m["gndIdentifier"] ?? "");
			if ($id === "") continue;
			$out[] = [
				"source"       => "gnd",
				"id"           => $id,
				"label"        => (string)($m["preferredName"] ?? $id),
				"description"  => self::gndDesc($m, $types),
				"category"     => SchemaModel::resourceCategory("GNDResource"),
				"resourceType" => "GNDResource",
				"uri"          => (string)($m["id"] ?? "https://d-nb.info/gnd/{$id}"),
			];
		}
		return $out;
	}

	private static function typeMatches(array $types, string $needle): bool {
		foreach ($types as $t) if (stripos($t, $needle) !== false) return true;
		return false;
	}

	private static function gndDesc(array $m, array $types): string {
		$bits = [];
		foreach (["dateOfBirthAndDeath", "professionOrOccupation", "placeOfBirth", "biographicalOrHistoricalInformation", "definition"] as $k) {
			if (!empty($m[$k])) {
				$v = $m[$k];
				$v = is_array($v) ? (isset($v[0]["label"]) ? $v[0]["label"] : (is_array($v[0]) ? reset($v[0]) : $v[0])) : $v;
				if (is_string($v) && $v !== "") { $bits[] = $v; break; }
			}
		}
		$human = array_values(array_filter($types, fn($t) => !str_contains($t, "AuthorityResource")));
		if ($human) array_unshift($bits, $human[0]);
		return trim(implode(" · ", array_slice($bits, 0, 2)));
	}

	/* ---------------- Wikidata ---------------- */

	private static function wikidata(string $q, string $kind): array {
		$j = self::get("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=8&language=de&uselang=de&type=item&search=" . rawurlencode($q));
		$out = [];
		foreach (($j["search"] ?? []) as $s) {
			$id = (string)($s["id"] ?? "");
			if (!preg_match('/^[LPQ]\d+$/', $id)) continue;
			$out[] = [
				"source"       => "wikidata",
				"id"           => $id,
				"label"        => (string)($s["label"] ?? $id),
				"description"  => (string)($s["description"] ?? ""),
				"category"     => SchemaModel::resourceCategory("WikidataResource"),
				"resourceType" => "WikidataResource",
				"uri"          => (string)($s["concepturi"] ?? "https://www.wikidata.org/wiki/{$id}"),
			];
		}
		return $out;
	}

	/* ---------------- VIAF ---------------- */

	private static function viaf(string $q, string $kind): array {
		$nametype = self::KIND[$kind][2] ?? null;
		$j = self::get("https://viaf.org/viaf/AutoSuggest?query=" . rawurlencode($q));
		$out = [];
		foreach (($j["result"] ?? []) as $r) {
			if ($nametype !== null && strtolower((string)($r["nametype"] ?? "")) !== $nametype) continue;
			$id = (string)($r["viafid"] ?? "");
			if (!preg_match('/^\d+$/', $id)) continue;
			$out[] = [
				"source"       => "viaf",
				"id"           => $id,
				"label"        => (string)($r["term"] ?? $id),
				"description"  => "VIAF · " . (string)($r["nametype"] ?? ""),
				"category"     => SchemaModel::resourceCategory("VIAFResource"),
				"resourceType" => "VIAFResource",
				"uri"          => "https://viaf.org/viaf/{$id}",
			];
		}
		return $out;
	}

	/* ---------------- HTTP ---------------- */

	private static function get(string $url, int $timeout = 6): array {
		if (function_exists("curl_init")) {
			$ch = curl_init($url);
			curl_setopt_array($ch, [
				CURLOPT_RETURNTRANSFER => true,
				CURLOPT_FOLLOWLOCATION => true,
				CURLOPT_CONNECTTIMEOUT => 4,
				CURLOPT_TIMEOUT        => $timeout,
				CURLOPT_USERAGENT      => self::UA,
				CURLOPT_HTTPHEADER     => ["Accept: application/json"],
			]);
			$body = curl_exec($ch);
			$err  = curl_error($ch);
			curl_close($ch);
			if ($body === false) throw new \RuntimeException($err ?: "HTTP-Fehler");
		} else {
			$ctx = stream_context_create(["http" => [
				"timeout" => $timeout, "header" => "User-Agent: " . self::UA . "\r\nAccept: application/json\r\n",
			]]);
			$body = @file_get_contents($url, false, $ctx);
			if ($body === false) throw new \RuntimeException("HTTP-Fehler");
		}
		$j = json_decode((string)$body, true);
		return is_array($j) ? $j : [];
	}
}
