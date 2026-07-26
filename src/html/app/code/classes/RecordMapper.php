<?php
/*
 * RecordMapper — bildet eine flache Quell-Zeile (CSV-Spalten / JSON-Keys) auf
 * einen internen AVefi-Record ab: Work → Manifestation(en) → Item(s).
 *
 * Hinweis: Die Feldnamen orientieren sich am Wireframe-Editor, nicht (noch) an den
 * exakten av-efi-schema-Property-URIs (LinkML). Das Mapping auf die echten
 * Schema-Felder + JSON-Schema-Validierung ist ein Folgeschritt.
 */

class RecordMapper {

	/** Ordnet einen Spalten-/Key-Namen einem logischen Feld zu (oder null). */
	public static function classify(string $header): ?string {
		$h = self::normalize($header);
		if ($h === "") return null;

		// Reihenfolge: spezifisch vor allgemein.
		if (self::has($h, ["haupttitel", "originaltitel", "filmtitel", "movietitle", "titel", "title"])
			&& !self::has($h, ["untertitel", "subtitle"])) return "title";
		if (self::has($h, ["regisseur", "regie", "director"]))                      return "director";
		if (self::has($h, ["produktionsjahr", "entstehungsjahr", "entst_jahr", "jahr", "year"])) return "year";
		if (self::has($h, ["herstellungsland", "produktionsland", "country", "land"])) return "country";
		if (self::has($h, ["werkart", "gattung", "filmart", "worktype"]))           return "work_type";
		if (self::has($h, ["genre"]))                                              return "genre";
		if (self::has($h, ["sprache", "language"]))                                return "language";
		if (self::has($h, ["traeger", "carrier"]))                                 return "carrier";
		if (self::has($h, ["laenge", "laufzeit", "duration", "minuten", "min"]))    return "duration";
		if (self::has($h, ["signatur", "signature", "sign"]))                      return "signature";
		if (self::has($h, ["standort", "lagerort", "location"]))                    return "location";
		if (self::has($h, ["institution", "archiv", "bestand", "holding", "haltende"])) return "institution";
		if (self::has($h, ["beschreibung", "description", "inhalt", "synopsis", "kommentar"])) return "description";
		if (self::has($h, ["format"]))                                             return "carrier"; // generisch
		return null;
	}

	/** Hat die Kopfzeile eine erkennbare Titel-Spalte? (Voraussetzung für generische Konvertierung) */
	public static function hasTitleColumn(array $headers): bool {
		foreach ($headers as $h) if (self::classify((string)$h) === "title") return true;
		return false;
	}

	/**
	 * Baut aus einer assoziativen Quell-Zeile einen Record.
	 * @param array<string,mixed> $assoc  header => value
	 */
	public static function fromAssoc(array $assoc, string $sourceFile, ?int $rowNum): array {
		$w = ["title" => null, "year" => null, "work_type" => null, "country" => null,
		      "genre" => null, "language" => null, "description" => null, "contributors" => []];
		$carrier = null; $duration = null;
		$signature = null; $institution = null; $location = null;
		$director = null; $extra = [];

		foreach ($assoc as $col => $val) {
			$val = is_scalar($val) ? trim((string)$val) : "";
			if ($val === "") continue;
			switch (self::classify((string)$col)) {
				case "title":       $w["title"]       = $val; break;
				case "year":        $w["year"]        = self::toYear($val); break;
				case "work_type":   $w["work_type"]   = $val; break;
				case "country":     $w["country"]     = $val; break;
				case "genre":       $w["genre"]       = $val; break;
				case "language":    $w["language"]    = $val; break;
				case "description": $w["description"] = $val; break;
				case "director":    $director         = $val; break;
				case "carrier":     $carrier          = $val; break;
				case "duration":    $duration         = self::toInt($val); break;
				case "signature":   $signature        = $val; break;
				case "institution": $institution      = $val; break;
				case "location":    $location         = $val; break;
				default:            $extra[(string)$col] = $val;
			}
		}

		if ($director !== null) $w["contributors"][] = ["role" => "director", "name" => $director];

		$manifestations = [];
		if ($carrier !== null || $duration !== null) {
			$manifestations[] = array_filter([
				"carrier"      => $carrier,
				"duration_min" => $duration,
			], fn($v) => $v !== null && $v !== "");
		}

		$items = [];
		if ($signature !== null || $institution !== null || $location !== null) {
			$items[] = array_filter([
				"holding_institution" => $institution,
				"signature"           => $signature,
				"location"            => $location,
			], fn($v) => $v !== null && $v !== "");
		}

		$source = ["file" => $sourceFile];
		if ($rowNum !== null) $source["row"] = $rowNum;
		if ($extra)           $source["extra"] = $extra;

		return ["work" => $w, "manifestations" => $manifestations, "items" => $items, "source" => $source];
	}

	/** Zeile ganz leer? */
	public static function isEmptyRow(array $assoc): bool {
		foreach ($assoc as $v) if (is_scalar($v) && trim((string)$v) !== "") return false;
		return true;
	}

	private static function normalize(string $h): string {
		$h = mb_strtolower(trim($h));
		$h = strtr($h, ["ä" => "ae", "ö" => "oe", "ü" => "ue", "ß" => "ss"]);
		return preg_replace('/[^a-z0-9]+/', "", $h) ?? "";
	}
	private static function has(string $haystack, array $needles): bool {
		foreach ($needles as $n) if (str_contains($haystack, $n)) return true;
		return false;
	}
	private static function toYear(string $v): ?int {
		return preg_match('/(\d{4})/', $v, $m) ? (int)$m[1] : null;
	}
	private static function toInt(string $v): ?int {
		return preg_match('/(\d+)/', $v, $m) ? (int)$m[1] : null;
	}
}
