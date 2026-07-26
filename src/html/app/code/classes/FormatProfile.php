<?php
/*
 * FormatProfile — Zugriff auf format_profiles (converter_key → Profil-Zeile).
 */

class FormatProfile {

	/** Liefert die id des Profils zu einem converter_key, legt es bei Bedarf an. */
	public static function ensure(string $converterKey, string $label, ?string $baseFormat): int {
		$id = DB::value("SELECT id FROM format_profiles WHERE converter_key = :k", [":k" => $converterKey]);
		if ($id !== null) return (int)$id;
		return (int)DB::insert("format_profiles", [
			"converter_key" => $converterKey,
			"label"         => $label,
			"base_format"   => $baseFormat ?? "",
		], "id");
	}
}
