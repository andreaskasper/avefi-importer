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

	/* ---------------- Detail (für „Wikipedia-Auszug"-Modal) ---------------- */

	private const ID_PATTERN = ["wikidata" => '/^[LPQ]\d+$/', "gnd" => '/^[-\dX]+$/', "viaf" => '/^\d+$/'];

	/** Ausführliche Infos zu einem Treffer: {title, description, extract, image, url, wikiUrl}. */
	public static function detail(string $source, string $id): array {
		$source = strtolower(trim($source));
		$empty = ["source" => $source, "id" => $id, "title" => $id, "description" => "", "extract" => "", "image" => "", "url" => "", "wikiUrl" => ""];
		if (!isset(self::ID_PATTERN[$source]) || !preg_match(self::ID_PATTERN[$source], $id)) return $empty;
		try {
			if ($source === "wikidata") return self::detailWikidata($id);
			if ($source === "gnd")      return self::detailGnd($id);
			if ($source === "viaf")     return self::detailViaf($id);
		} catch (\Throwable $e) {
			error_log("[AuthorityLookup] detail {$source}/{$id}: " . $e->getMessage());
		}
		return $empty;
	}

	private static function detailWikidata(string $id): array {
		$j = self::get("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" . rawurlencode($id)
			. "&props=labels%7Cdescriptions%7Csitelinks%7Cclaims&languages=de%7Cen");
		$e = $j["entities"][$id] ?? [];
		$title = $e["labels"]["de"]["value"] ?? $e["labels"]["en"]["value"] ?? $id;
		$desc  = $e["descriptions"]["de"]["value"] ?? $e["descriptions"]["en"]["value"] ?? "";
		$wikiTitle = null; $lang = "de";
		if (!empty($e["sitelinks"]["dewiki"]["title"]))      { $wikiTitle = $e["sitelinks"]["dewiki"]["title"]; $lang = "de"; }
		elseif (!empty($e["sitelinks"]["enwiki"]["title"]))  { $wikiTitle = $e["sitelinks"]["enwiki"]["title"]; $lang = "en"; }
		$extract = ""; $image = ""; $wikiUrl = "";
		if ($wikiTitle !== null) { $s = self::wikiSummary($lang, $wikiTitle); $extract = $s["extract"]; $image = $s["image"]; $wikiUrl = $s["url"]; }
		if ($image === "") {
			$p18 = $e["claims"]["P18"][0]["mainsnak"]["datavalue"]["value"] ?? null;
			if (is_string($p18)) $image = "https://commons.wikimedia.org/wiki/Special:FilePath/" . rawurlencode($p18) . "?width=320";
		}
		return ["source" => "wikidata", "id" => $id, "title" => $title, "description" => $desc, "extract" => $extract, "image" => $image, "url" => "https://www.wikidata.org/wiki/" . $id, "wikiUrl" => $wikiUrl];
	}

	private static function detailGnd(string $id): array {
		$j = self::get("https://lobid.org/gnd/" . rawurlencode($id) . ".json");
		$title = (string)($j["preferredName"] ?? $id);
		$bits = [];
		foreach (($j["professionOrOccupation"] ?? []) as $p) { if (!empty($p["label"])) { $bits[] = $p["label"]; if (count($bits) >= 2) break; } }
		$dob = $j["dateOfBirth"][0] ?? null; $dod = $j["dateOfDeath"][0] ?? null;
		if ($dob || $dod) $bits[] = trim(($dob ?: "") . "–" . ($dod ?: ""), "–") !== "" ? ("* " . ($dob ?: "?") . ($dod ? " † " . $dod : "")) : "";
		$desc = trim(implode(" · ", array_filter($bits)));
		if ($desc === "") {
			foreach (["definition", "biographicalOrHistoricalInformation"] as $k) {
				$v = $j[$k][0]["label"] ?? $j[$k][0] ?? null;
				if (is_string($v) && $v !== "") { $desc = $v; break; }
			}
		}
		$image = (string)($j["depiction"][0]["thumbnail"] ?? $j["depiction"][0]["id"] ?? "");
		$extract = ""; $wikiUrl = "";
		foreach (($j["sameAs"] ?? []) as $sa) {
			$u = (string)($sa["id"] ?? "");
			if (preg_match('#^https?://de\.wikipedia\.org/wiki/(.+)$#', $u, $mm)) {
				$s = self::wikiSummary("de", rawurldecode($mm[1]));
				$extract = $s["extract"]; if ($image === "") $image = $s["image"]; $wikiUrl = $s["url"];
				break;
			}
		}
		return ["source" => "gnd", "id" => $id, "title" => $title, "description" => $desc, "extract" => $extract, "image" => $image, "url" => (string)($j["id"] ?? "https://d-nb.info/gnd/" . $id), "wikiUrl" => $wikiUrl];
	}

	private static function detailViaf(string $id): array {
		$j = self::get("https://viaf.org/viaf/" . rawurlencode($id) . "/viaf.json");
		$data = $j["mainHeadings"]["data"] ?? null;
		$title = "";
		if (is_array($data)) $title = (string)($data["text"] ?? ($data[0]["text"] ?? ""));
		if ($title === "") $title = $id;
		return ["source" => "viaf", "id" => $id, "title" => $title, "description" => "VIAF-Normdatensatz", "extract" => "", "image" => "", "url" => "https://viaf.org/viaf/" . $id, "wikiUrl" => ""];
	}

	private static function wikiSummary(string $lang, string $title): array {
		$lang = preg_match('/^[a-z]{2}$/', $lang) ? $lang : "de";
		$j = self::get("https://{$lang}.wikipedia.org/api/rest_v1/page/summary/" . rawurlencode(str_replace(" ", "_", $title)));
		return [
			"extract" => (string)($j["extract"] ?? ""),
			"image"   => (string)($j["thumbnail"]["source"] ?? ""),
			"url"     => (string)($j["content_urls"]["desktop"]["page"] ?? ""),
		];
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
