<?php
/*
 * Transform — Registry der Konverter-Operationen einer Mapping-Kette.
 *
 * Jeder Schritt ist ein Objekt mit "op" plus Parametern:
 *   {"op":"trim"}  {"op":"split","sep":";"}  {"op":"valuemap","map":{…}}
 * Bewusst kein nackter String als Kurzform — sobald eine Operation einen Parameter
 * braucht, gäbe es zwei Formen für dieselbe Sache.
 *
 * Typen für die statische Kettenprüfung: "text" (Skalar), "list", "number", "any".
 * Jede Operation deklariert, was sie hereinnimmt und was sie herausgibt; damit lässt
 * sich der Ausgabetyp einer Kette ohne Ausführung bestimmen.
 *
 * Diese Registry ist die EINZIGE Implementierung. Die Live-Vorschau im Editor ruft
 * sie per AJAX auf, statt dieselbe Logik in JavaScript zu wiederholen — sonst
 * führten Vorschau und echte Konvertierung unterschiedlichen Code aus.
 */

class Transform {

	/** Operationen mit Beschreibung für Editor und Prüfung. */
	public static function catalog(): array {
		return [
			/* --- Text --- */
			"trim"      => ["label" => "Leerraum entfernen", "group" => "Text", "in" => "any", "out" => "same",
			                "params" => [["name" => "chars", "label" => "Zusätzliche Zeichen", "type" => "text", "optional" => true]]],
			"lowercase" => ["label" => "Kleinschreibung", "group" => "Text", "in" => "any", "out" => "same", "params" => []],
			"uppercase" => ["label" => "GROSSSCHREIBUNG", "group" => "Text", "in" => "any", "out" => "same", "params" => []],
			"ucfirst"   => ["label" => "Erster Buchstabe groß", "group" => "Text", "in" => "any", "out" => "same", "params" => []],
			"replace"   => ["label" => "Ersetzen", "group" => "Text", "in" => "any", "out" => "same",
			                "params" => [["name" => "search", "label" => "Suchen", "type" => "text"],
			                             ["name" => "with", "label" => "Ersetzen durch", "type" => "text", "optional" => true],
			                             ["name" => "regex", "label" => "Regulärer Ausdruck", "type" => "bool", "optional" => true]]],
			"substring" => ["label" => "Ausschnitt", "group" => "Text", "in" => "any", "out" => "same",
			                "params" => [["name" => "start", "label" => "Ab Position", "type" => "int"],
			                             ["name" => "length", "label" => "Länge", "type" => "int", "optional" => true]]],
			"default"   => ["label" => "Standardwert bei leer", "group" => "Text", "in" => "any", "out" => "same",
			                "params" => [["name" => "value", "label" => "Wert", "type" => "text"]]],
			"template"  => ["label" => "In Muster einsetzen", "group" => "Text", "in" => "any", "out" => "same",
			                "params" => [["name" => "pattern", "label" => "Muster (mit {value})", "type" => "text"]]],

			/* --- Struktur --- */
			"split"   => ["label" => "Aufteilen", "group" => "Struktur", "in" => "text", "out" => "list",
			              "params" => [["name" => "sep", "label" => "Trennzeichen", "type" => "text"],
			                           ["name" => "unique", "label" => "Doppelte entfernen", "type" => "bool", "optional" => true]]],
			"join"    => ["label" => "Zusammenfügen", "group" => "Struktur", "in" => "list", "out" => "text",
			              "params" => [["name" => "sep", "label" => "Trennzeichen", "type" => "text", "optional" => true]]],
			"take"    => ["label" => "Element auswählen", "group" => "Struktur", "in" => "list", "out" => "text",
			              "params" => [["name" => "index", "label" => "Position (1 = erstes, -1 = letztes)", "type" => "int"]]],
			"concat"  => ["label" => "Spalten verbinden", "group" => "Struktur", "in" => "any", "out" => "text",
			              "params" => [["name" => "columns", "label" => "Weitere Spalten", "type" => "columns"],
			                           ["name" => "sep", "label" => "Trennzeichen", "type" => "text", "optional" => true]]],

			/* --- Typen --- */
			"number"   => ["label" => "Zahl", "group" => "Typen", "in" => "text", "out" => "number",
			               "params" => [["name" => "decimal", "label" => "Dezimalzeichen", "type" => "text", "optional" => true]]],
			"year"     => ["label" => "Jahreszahl herauslösen", "group" => "Typen", "in" => "text", "out" => "text", "params" => []],
			"date"     => ["label" => "Datum nach ISO", "group" => "Typen", "in" => "text", "out" => "text",
			               "params" => [["name" => "from", "label" => "Quellformat (z. B. d.m.Y)", "type" => "text", "optional" => true]]],
			"duration" => ["label" => "Laufzeit nach ISO 8601", "group" => "Typen", "in" => "text", "out" => "text",
			               "params" => [["name" => "unit", "label" => "Einheit der Quelle", "type" => "choice",
			                             "choices" => ["minutes" => "Minuten", "seconds" => "Sekunden", "hours" => "Stunden", "auto" => "erkennen"]]]],

			/* --- Vokabular und Normdaten --- */
			"valuemap" => ["label" => "Werteliste zuordnen", "group" => "Vokabular", "in" => "any", "out" => "same",
			               "params" => [["name" => "map", "label" => "Zuordnung", "type" => "map"],
			                            ["name" => "ci", "label" => "Groß/Klein egal", "type" => "bool", "optional" => true],
			                            ["name" => "fallback", "label" => "Unbekannter Wert", "type" => "choice",
			                             "choices" => ["keep_note" => "als Notiz behalten", "drop" => "verwerfen",
			                                           "keep" => "unverändert übernehmen", "error" => "beanstanden"]]]],
			"authority" => ["label" => "Normdaten nachschlagen", "group" => "Vokabular", "in" => "any", "out" => "same", "slow" => true,
			                "params" => [["name" => "source", "label" => "Quelle", "type" => "choice",
			                              "choices" => ["gnd" => "GND", "wikidata" => "Wikidata", "viaf" => "VIAF"]],
			                             ["name" => "kind", "label" => "Art", "type" => "choice",
			                              "choices" => ["person" => "Person", "corporate" => "Körperschaft", "place" => "Ort", "subject" => "Schlagwort"]]]],
		];
	}

	public static function exists(string $op): bool {
		return isset(self::catalog()[$op]);
	}

	/**
	 * Ausgabetyp einer Kette ohne Ausführung.
	 * @return array{type:string,errors:string[]}
	 */
	public static function chainType(array $chain, string $inputType = "text"): array {
		$cat = self::catalog();
		$t = $inputType;
		$errors = [];
		foreach ($chain as $i => $step) {
			$op = is_array($step) ? (string)($step["op"] ?? "") : "";
			if (!isset($cat[$op])) { $errors[] = "Schritt " . ($i + 1) . ": unbekannte Operation „{$op}\""; continue; }
			$meta = $cat[$op];
			if ($meta["in"] !== "any" && $meta["in"] !== $t && !($meta["in"] === "text" && $t === "number")) {
				$errors[] = "Schritt " . ($i + 1) . " ({$meta['label']}) erwartet " . self::typeLabel($meta["in"])
				          . ", bekommt aber " . self::typeLabel($t);
			}
			$t = $meta["out"] === "same" ? $t : $meta["out"];
		}
		return ["type" => $t, "errors" => $errors];
	}

	public static function typeLabel(string $t): string {
		switch ($t) {
			case "list":   return "eine Liste";
			case "number": return "eine Zahl";
			case "text":   return "einen Einzelwert";
			default:       return "beliebiges";
		}
	}

	/**
	 * Führt eine Kette aus.
	 * @param mixed $value  Startwert (String oder Liste)
	 * @param array $ctx    ["row"=>assoc, "diag"=>Diagnostics|null]
	 * @return array{value:mixed,notes:string[],errors:string[],enrich:array}
	 */
	public static function run(array $chain, $value, array $ctx = []): array {
		$notes = []; $errors = []; $enrich = [];
		foreach ($chain as $step) {
			if (!is_array($step)) continue;
			$op = (string)($step["op"] ?? "");
			if (!self::exists($op)) { $errors[] = "Unbekannte Operation „{$op}\""; continue; }
			try {
				$value = self::apply($op, $step, $value, $ctx, $notes, $errors, $enrich);
			} catch (\Throwable $e) {
				$errors[] = "{$op}: " . $e->getMessage();
			}
		}
		return ["value" => $value, "notes" => $notes, "errors" => $errors, "enrich" => $enrich];
	}

	/** Wendet eine Operation an; Listen werden elementweise behandelt, wo sinnvoll. */
	private static function apply(string $op, array $p, $value, array $ctx, array &$notes, array &$errors, array &$enrich = []) {
		$elementwise = ["trim", "lowercase", "uppercase", "ucfirst", "replace", "substring",
		                "template", "number", "year", "date", "duration", "valuemap", "authority"];

		if (is_array($value) && in_array($op, $elementwise, true)) {
			$out = [];
			foreach ($value as $v) {
				$r = self::apply($op, $p, $v, $ctx, $notes, $errors, $enrich);
				if ($r === null || $r === "") continue;
				if (is_array($r)) { foreach ($r as $x) $out[] = $x; } else { $out[] = $r; }
			}
			return $out;
		}

		switch ($op) {
			case "trim":
				$chars = (string)($p["chars"] ?? "");
				return $chars !== "" ? trim((string)$value, " \t\n\r\0\x0B" . $chars) : trim((string)$value);

			case "lowercase": return mb_strtolower((string)$value);
			case "uppercase": return mb_strtoupper((string)$value);
			case "ucfirst":
				$s = (string)$value;
				return $s === "" ? $s : mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);

			case "replace":
				$search = (string)($p["search"] ?? "");
				$with   = (string)($p["with"] ?? "");
				if ($search === "") return $value;
				if (!empty($p["regex"])) {
					$re = "/" . str_replace("/", "\\/", $search) . "/u";
					$r = @preg_replace($re, $with, (string)$value);
					if ($r === null) { $errors[] = "Ungültiger regulärer Ausdruck: {$search}"; return $value; }
					return $r;
				}
				return str_replace($search, $with, (string)$value);

			case "substring":
				$start = (int)($p["start"] ?? 0);
				$len   = isset($p["length"]) && $p["length"] !== "" ? (int)$p["length"] : null;
				return $len === null ? mb_substr((string)$value, $start) : mb_substr((string)$value, $start, $len);

			case "default":
				$empty = is_array($value) ? count($value) === 0 : trim((string)$value) === "";
				return $empty ? (string)($p["value"] ?? "") : $value;

			case "template":
				$pattern = (string)($p["pattern"] ?? "");
				if ($pattern === "" || trim((string)$value) === "") return $value;
				return str_replace("{value}", (string)$value, $pattern);

			case "split":
				$sep = (string)($p["sep"] ?? ";");
				if ($sep === "") return [(string)$value];
				$parts = array_map("trim", explode($sep, (string)$value));
				$parts = array_values(array_filter($parts, fn($x) => $x !== ""));
				return !empty($p["unique"]) ? array_values(array_unique($parts)) : $parts;

			case "join":
				$sep = (string)($p["sep"] ?? "; ");
				return is_array($value) ? implode($sep, array_map("strval", $value)) : (string)$value;

			case "take":
				if (!is_array($value)) return $value;
				$i = (int)($p["index"] ?? 1);
				$list = array_values($value);
				if ($i > 0)  return $list[$i - 1] ?? "";
				if ($i < 0)  return $list[count($list) + $i] ?? "";
				return $list[0] ?? "";

			case "concat":
				$cols = is_array($p["columns"] ?? null) ? $p["columns"] : [];
				$sep  = (string)($p["sep"] ?? " ");
				$row  = is_array($ctx["row"] ?? null) ? $ctx["row"] : [];
				$parts = [];
				$first = is_array($value) ? implode(" ", $value) : (string)$value;
				if (trim($first) !== "") $parts[] = trim($first);
				foreach ($cols as $c) {
					$v = trim((string)($row[(string)$c] ?? ""));
					if ($v !== "") $parts[] = $v;
				}
				return implode($sep, $parts);

			case "number":
				$s = (string)$value;
				$dec = (string)($p["decimal"] ?? ",");
				$s = preg_replace('/[^\d' . preg_quote($dec, "/") . '\-]/u', "", $s) ?? $s;
				$s = str_replace($dec, ".", $s);
				if ($s === "" || !is_numeric($s)) { if (trim((string)$value) !== "") $errors[] = "„{$value}\" ist keine Zahl"; return ""; }
				return 0 + $s;

			case "year":
				if (preg_match('/(\d{4})/', (string)$value, $m)) return $m[1];
				if (trim((string)$value) !== "") $errors[] = "keine Jahreszahl in „{$value}\" gefunden";
				return "";

			case "date":
				return self::toIsoDate((string)$value, (string)($p["from"] ?? ""), $errors);

			case "duration":
				return self::toIsoDuration((string)$value, (string)($p["unit"] ?? "auto"), $errors);

			case "valuemap":
				return self::valuemap((string)$value, $p, $notes, $errors);

			case "authority":
				// Reichert an, statt zu ersetzen: Der Name bleibt der Wert, die gefundene
				// ID wird über den Nebenkanal gemeldet und vom AvefiBuilder als same_as
				// an die erzeugte Entität gehängt. Vorher wurde der Name mit der ID
				// überschrieben — bei einem Regie-Feld stand dann die GND-Nummer im Namen.
				$source = (string)($p["source"] ?? "gnd");
				$id = AuthorityLookup::resolveId((string)$value, $source,
				                                 (string)($p["kind"] ?? "person"), $errors);
				if ($id !== "") {
					$resType = AuthorityLookup::resourceTypeFor($source);
					if ($resType !== null) {
						$enrich[] = [
							"value"    => (string)$value,
							"category" => SchemaModel::resourceCategory($resType),
							"id"       => $id,
							"resource" => $resType,
						];
					}
				}
				return $value;
		}
		return $value;
	}

	/* ---------------- Einzelne Umwandlungen ---------------- */

	/** Datum nach ISO (YYYY, YYYY-MM oder YYYY-MM-DD) — das ist auch EDTF-konform. */
	public static function toIsoDate(string $v, string $from, array &$errors): string {
		$v = trim($v);
		if ($v === "") return "";

		if ($from !== "") {
			$dt = \DateTime::createFromFormat("!" . $from, $v);
			if ($dt !== false) return $dt->format("Y-m-d");
		}
		if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v))    return $v;
		if (preg_match('/^(\d{4})-(\d{2})$/', $v))            return $v;
		if (preg_match('/^(\d{4})$/', $v))                    return $v;
		if (preg_match('/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/', $v, $m))
			return sprintf("%04d-%02d-%02d", $m[3], $m[2], $m[1]);
		if (preg_match('/^(\d{1,2})\.(\d{4})$/', $v, $m))     return sprintf("%04d-%02d", $m[2], $m[1]);
		if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $v, $m))
			return sprintf("%04d-%02d-%02d", $m[3], $m[1], $m[2]);
		if (preg_match('/(\d{4})/', $v, $m))                  return $m[1];

		$errors[] = "„{$v}\" konnte nicht als Datum gelesen werden";
		return "";
	}

	/**
	 * Laufzeit nach ISO 8601. Das AVefi-Schema verlangt genau
	 * PT[hh]H[mm]M[ss]S mit MINDESTENS zweistelligen Werten
	 * (Pattern ^PT[1-9]*[0-9][0-9]H[0-5][0-9]M[0-5][0-9]S$) — einstellige
	 * Angaben sind nicht schemakonform.
	 */
	public static function toIsoDuration(string $v, string $unit, array &$errors): string {
		$v = trim($v);
		if ($v === "") return "";
		if (preg_match('/^PT\d{2,}H[0-5]\dM[0-5]\dS$/', $v)) return $v;   // schon schemakonform

		// hh:mm:ss oder mm:ss
		if (preg_match('/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/', $v, $m)) {
			$sec = isset($m[3]) && $m[3] !== ""
				? ((int)$m[1] * 3600 + (int)$m[2] * 60 + (int)$m[3])
				: ((int)$m[1] * 60 + (int)$m[2]);
			return self::secondsToIso($sec);
		}
		// bereits ISO, aber mit einstelligen Werten → normalisieren
		if (preg_match('/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i', $v, $m)) {
			$sec = ((int)($m[1] ?? 0)) * 3600 + ((int)($m[2] ?? 0)) * 60 + ((int)($m[3] ?? 0));
			if ($sec > 0) return self::secondsToIso($sec);
		}

		$num = str_replace(",", ".", preg_replace('/[^\d,.]/', "", $v) ?? "");
		if ($num === "" || !is_numeric($num)) { $errors[] = "„{$v}\" konnte nicht als Laufzeit gelesen werden"; return ""; }
		$n = (float)$num;
		switch ($unit) {
			case "seconds": $sec = (int)round($n); break;
			case "hours":   $sec = (int)round($n * 3600); break;
			case "minutes": $sec = (int)round($n * 60); break;
			default:        $sec = (int)round($n * 60);   // „auto": Minuten sind der Normalfall
		}
		return self::secondsToIso($sec);
	}

	public static function secondsToIso(int $sec): string {
		if ($sec < 0) $sec = 0;
		return sprintf("PT%02dH%02dM%02dS", intdiv($sec, 3600), intdiv($sec % 3600, 60), $sec % 60);
	}

	private static function valuemap(string $v, array $p, array &$notes, array &$errors) {
		$map = is_array($p["map"] ?? null) ? $p["map"] : [];
		$key = trim($v);
		if ($key === "") return "";

		if (array_key_exists($key, $map)) return (string)$map[$key];
		if (!empty($p["ci"])) {
			foreach ($map as $k => $val) {
				if (mb_strtolower((string)$k) === mb_strtolower($key)) return (string)$val;
			}
		}
		switch ((string)($p["fallback"] ?? "keep_note")) {
			case "drop":  return "";
			case "keep":  return $v;
			case "error": $errors[] = "Wert „{$v}\" ist in der Zuordnung nicht enthalten"; return "";
			default:
				$notes[] = $v;                 // als Notiz erhalten statt wegwerfen
				return "";
		}
	}
}
