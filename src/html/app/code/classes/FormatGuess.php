<?php
/*
 * FormatGuess — bestimmt ein aussagekräftiges Format-/Schema-Label für die
 * Import-Übersicht (Badge), genauer als nur „JSON"/„XML". Nutzt den
 * Struktur-Fingerabdruck aus Fingerprint::analyze().
 */

class FormatGuess {

	/**
	 * Anzeige-Label für den Format-Badge.
	 * @param array $analysis  Ergebnis aus Fingerprint::analyze()
	 * @param bool  $parseOk   ob die Datei syntaktisch gültig ist
	 */
	public static function describe(?string $baseFormat, array $analysis, bool $parseOk = true): string {
		$columns = $analysis["columns"] ?? [];
		$sample  = $analysis["sample"] ?? [];

		switch ($baseFormat) {
			case "json":
				if (!$parseOk) return "JSON (fehlerhaft)";
				return self::jsonSchema($columns, $sample)["label"];

			case "csv":
			case "tsv":
				return strtoupper($baseFormat) . (count($columns) ? " · " . count($columns) . " Spalten" : "");

			default: // xml/ead/marcxml/…
				if (!$parseOk) return "XML (fehlerhaft)";
				return self::xmlLabel($baseFormat, $sample, $columns);
		}
	}

	/**
	 * JSON-Struktur → mutmaßliches Schema.
	 * @return array{label:string,key:?string}  key = passender converter_key (oder null)
	 */
	public static function jsonSchema(array $columns, $sample): array {
		$cols  = array_map(fn($c) => strtolower((string)$c), $columns);
		$first = is_array($sample) ? ($sample[0] ?? null) : null;
		$cat   = is_array($first) ? (string)($first["category"] ?? "") : "";

		if (str_starts_with($cat, "avefi:")
			|| self::any($cols, ["has_primary_title", "has_record", "is_manifestation_of", "is_item_of"])) {
			return ["label" => "AVefi (nativ)", "key" => "avefi_json_v1"];
		}
		if (self::any($cols, ["leader", "fields", "controlfield", "datafield"])) {
			return ["label" => "MARC-in-JSON", "key" => null];
		}
		if (self::any($cols, ["lido", "lidorecid", "descriptivemetadata"])) {
			return ["label" => "LIDO-JSON", "key" => null];
		}
		if (self::any($cols, ["dc:title", "dcterms:title", "identifier.dc"])) {
			return ["label" => "Dublin-Core-JSON", "key" => null];
		}
		if (RecordMapper::hasTitleColumn($columns)) {
			return ["label" => "Objektliste (JSON)", "key" => "generic_json_v1"];
		}
		return ["label" => "JSON (Struktur unbekannt)", "key" => null];
	}

	private static function xmlLabel(?string $baseFormat, $sample, array $columns): string {
		$root = strtolower((string)(is_array($sample) ? ($sample["root"] ?? "") : ""));
		$ns   = strtolower((string)(is_array($sample) ? ($sample["namespace"] ?? "") : ""));
		$childs = array_map(fn($c) => strtolower((string)$c), $columns);

		if ($baseFormat === "marcxml" || str_contains($ns, "marc21") || $root === "record"
			|| ($root === "collection" && in_array("record", $childs, true))) return "MARC-XML";
		if ($baseFormat === "ead" || $root === "ead"
			|| in_array("archdesc", $childs, true) || in_array("eadheader", $childs, true)) return "EAD";
		if (str_contains($ns, "lido") || $root === "lido" || $root === "lidowrap") return "LIDO";
		if ($root !== "") return "XML: <" . $root . ">";
		return "XML";
	}

	private static function any(array $haystack, array $needles): bool {
		foreach ($needles as $n) if (in_array($n, $haystack, true)) return true;
		return false;
	}
}
