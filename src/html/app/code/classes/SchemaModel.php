<?php
/*
 * SchemaModel — liest das echte av-efi-schema (html/schema/avefi/model.schema.json,
 * generiert aus dem LinkML-Schema von AV-EFI) und stellt Enums, Klassen-Slots und
 * die pro Klasse erlaubten same_as-/Identifier-Resource-Typen bereit.
 *
 * Damit sind Editor-Dropdowns und das ID-„Gating" (welche Authority-Quelle bei
 * welchem Feld erlaubt ist) schema-getrieben statt hartcodiert.
 */

class SchemaModel {

	private static ?array $model = null;
	private static bool $loaded = false;

	public static function path(): string {
		return dirname(__DIR__, 3) . "/schema/avefi/model.schema.json";
	}

	private static function model(): array {
		if (!self::$loaded) {
			self::$loaded = true;
			$raw = @file_get_contents(self::path());
			$m = $raw !== false ? json_decode($raw, true) : null;
			self::$model = (is_array($m) && isset($m['$defs'])) ? $m : ['$defs' => []];
		}
		return self::$model;
	}

	private static function defs(): array {
		return self::model()['$defs'] ?? [];
	}

	private static function def(string $class): ?array {
		return self::defs()[$class] ?? null;
	}

	/* ---------------- Enums ---------------- */

	/** Werte eines Enums (z. B. "TitleTypeEnum"). */
	public static function enum(string $name): array {
		$d = self::def($name);
		return isset($d["enum"]) && is_array($d["enum"]) ? array_values($d["enum"]) : [];
	}

	/** Alle Enums als Name => Werte[] (fürs Frontend). */
	public static function enums(): array {
		$out = [];
		foreach (self::defs() as $name => $d) {
			if (isset($d["enum"]) && is_array($d["enum"])) $out[$name] = array_values($d["enum"]);
		}
		return $out;
	}

	/** Ausgewählte Enums (nur die im Editor benötigten) als Name => Werte[]. */
	public static function enumsSubset(array $names): array {
		$out = [];
		foreach ($names as $n) $out[$n] = self::enum($n);
		return $out;
	}

	/* ---------------- Klassen / Slots ---------------- */

	/** Property-Namen einer Klasse. */
	public static function classProps(string $class): array {
		$d = self::def($class);
		return $d && isset($d["properties"]) ? array_keys($d["properties"]) : [];
	}

	/** Pflicht-Properties einer Klasse. */
	public static function required(string $class): array {
		$d = self::def($class);
		return $d && isset($d["required"]) ? array_values($d["required"]) : [];
	}

	public static function classExists(string $class): bool {
		return self::def($class) !== null;
	}

	/* ---------------- same_as / Identifier / Resource-Typen ---------------- */

	/**
	 * Erlaubte Resource-Typen für ein Listen-Property (z. B. same_as, has_identifier).
	 * Liefert Namen wie ["GNDResource","WikidataResource",…].
	 */
	public static function resourceTypesFor(string $class, string $property): array {
		$d = self::def($class);
		$p = $d["properties"][$property] ?? null;
		if (!is_array($p)) return [];
		// Sammle alle referenzierten Typen: anyOf-Liste ODER einzelner items.$ref / $ref.
		$refs = [];
		$anyOf = $p["items"]["anyOf"] ?? $p["anyOf"] ?? null;
		if (is_array($anyOf)) {
			foreach ($anyOf as $a) if (isset($a['$ref'])) $refs[] = $a['$ref'];
		}
		foreach ([$p["items"]['$ref'] ?? null, $p['$ref'] ?? null] as $single) {
			if (is_string($single)) $refs[] = $single;
		}
		$out = [];
		foreach ($refs as $ref) {
			$name = substr($ref, strrpos($ref, "/") + 1);
			if (str_ends_with($name, "Resource")) $out[] = $name;
		}
		return array_values(array_unique($out));
	}

	/** Kurzform für same_as einer Klasse. */
	public static function sameAsTypes(string $class): array {
		return self::resourceTypesFor($class, "same_as");
	}

	/** category-Wert eines Resource-Typs (z. B. WikidataResource → "avefi:WikidataResource"). */
	public static function resourceCategory(string $resourceType): string {
		$d = self::def($resourceType);
		$enum = $d["properties"]["category"]["enum"][0] ?? null;
		return is_string($enum) ? $enum : "avefi:" . $resourceType;
	}

	/** Validierungs-Pattern der id eines Resource-Typs (oder null). */
	public static function resourceIdPattern(string $resourceType): ?string {
		$d = self::def($resourceType);
		$p = $d["properties"]["id"]["pattern"] ?? null;
		return is_string($p) ? $p : null;
	}
}
