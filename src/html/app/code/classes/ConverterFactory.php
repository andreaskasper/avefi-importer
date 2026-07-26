<?php
/*
 * ConverterFactory — converter_key → Converter-Instanz, und die Auswahl eines
 * generischen Converters, wenn die Registry keinen exakten Treffer hat.
 */

class ConverterFactory {

	private const LABELS = [
		"generic_csv_v1"  => "Generisch (Tabelle)",
		"generic_json_v1" => "Generisch (JSON)",
		"marcxml_v1"      => "MARC-XML",
		"ead_v1"          => "EAD",
	];

	/** Direkt instanziierbare Converter: converter_key => Label. */
	public static function available(): array {
		return self::LABELS;
	}

	/** Menschlich lesbares Label je converter_key (für format_profiles.label). */
	public static function label(string $key): string {
		return self::LABELS[$key] ?? $key;
	}

	/** Instanziiert einen Converter für den gegebenen key (oder null). */
	public static function make(string $key, ?string $baseFormat = null): ?Converter {
		switch ($key) {
			case "generic_csv_v1":
				return new \converters\GenericCsvConverter($baseFormat === "tsv" ? "\t" : "auto");
			case "generic_json_v1":
				return new \converters\GenericJsonConverter();
			case "marcxml_v1":
				return new \converters\MarcXmlConverter();
			case "ead_v1":
				return new \converters\EadConverter();
		}
		return null;
	}

	/**
	 * Wählt einen generischen Converter, wenn die Quelle konvertierbar aussieht:
	 * CSV/TSV/JSON mit erkennbarer Titel-Spalte. Sonst null (→ Format-Review).
	 * $analysis stammt aus Fingerprint::analyze().
	 */
	public static function genericKey(?string $baseFormat, array $analysis): ?string {
		$columns = $analysis["columns"] ?? [];
		if (in_array($baseFormat, ["csv", "tsv"], true) && RecordMapper::hasTitleColumn($columns)) {
			return "generic_csv_v1";
		}
		if ($baseFormat === "json" && RecordMapper::hasTitleColumn($columns)) {
			return "generic_json_v1";
		}

		// XML-basiert: MARC-XML / EAD anhand Root-Element, Namespace und Kind-Elementen.
		$sample = is_array($analysis["sample"] ?? null) ? $analysis["sample"] : [];
		$root   = strtolower((string)($sample["root"] ?? ""));
		$ns     = strtolower((string)($sample["namespace"] ?? ""));
		$childs = array_map(fn($c) => strtolower((string)$c), $columns);

		if ($baseFormat === "marcxml" || str_contains($ns, "marc21") || $root === "record"
			|| ($root === "collection" && in_array("record", $childs, true))) {
			return "marcxml_v1";
		}
		if ($baseFormat === "ead" || $root === "ead"
			|| in_array("archdesc", $childs, true) || in_array("eadheader", $childs, true)) {
			return "ead_v1";
		}
		return null;
	}
}
