<?php
/*
 * ConverterFactory — converter_key → Converter-Instanz, und die Auswahl eines
 * generischen Converters, wenn die Registry keinen exakten Treffer hat.
 */

class ConverterFactory {

	private const LABELS = [
		"avefi_json_v1"   => "AVefi (nativ)",
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
			case "avefi_json_v1":
				return new \converters\AvefiJsonConverter();
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

		// Bereits natives AVefi-JSON? → nicht neu mappen, sondern Passthrough-Converter.
		if ($baseFormat === "json" && self::looksLikeAvefi($columns, $analysis["sample"] ?? null)) {
			return "avefi_json_v1";
		}
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

	/**
	 * Sieht die JSON-Quelle nach nativem AVefi aus? Signale: AVefi-typische Keys
	 * (has_primary_title / has_record / is_manifestation_of / is_item_of) oder ein
	 * category-Wert, der mit "avefi:" beginnt.
	 */
	private static function looksLikeAvefi(array $columns, $sample): bool {
		$cols = array_map(fn($c) => strtolower((string)$c), $columns);
		foreach (["has_primary_title", "has_record", "is_manifestation_of", "is_item_of"] as $marker) {
			if (in_array($marker, $cols, true)) return true;
		}
		$first = is_array($sample) ? ($sample[0] ?? null) : null;
		if (is_array($first) && isset($first["category"]) && str_starts_with((string)$first["category"], "avefi:")) return true;
		return false;
	}
}
