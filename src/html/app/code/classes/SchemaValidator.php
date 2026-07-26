<?php
/*
 * SchemaValidator — JSON-Schema-Validierung (Draft-07-Untermenge, selbst-enthalten).
 *
 * - validate()/isValid(): interner Record gegen html/schema/avefi-record.schema.json.
 * - validateAvefi(): AVefi-Record gegen das echte LinkML-Schema
 *   html/schema/avefi/model.schema.json (mit $ref/anyOf/pattern-Auflösung).
 *
 * Für vollständige Validierung steht opis/json-schema in composer.json bereit;
 * diese Untermenge deckt required/type/enum/pattern/$ref/anyOf/min-max ab.
 */

class SchemaValidator {

	private static ?array $schema = null;
	private static bool $loaded = false;

	/** $defs des gerade validierten Schemas (für $ref-Auflösung). */
	private static ?array $refDefs = null;
	private static array $avefiCache = [];

	public static function schemaPath(): string {
		return dirname(__DIR__, 3) . "/schema/avefi-record.schema.json";
	}
	public static function avefiSchemaPath(): string {
		return dirname(__DIR__, 3) . "/schema/avefi/model.schema.json";
	}

	private static function schema(): ?array {
		if (!self::$loaded) {
			self::$loaded = true;
			$raw = @file_get_contents(self::schemaPath());
			self::$schema = $raw !== false ? (json_decode($raw, true) ?: null) : null;
		}
		return self::$schema;
	}

	/** Interner Record gegen das Interim-Schema. @return string[] */
	public static function validate(array $record): array {
		$schema = self::schema();
		if ($schema === null) return [];
		self::$refDefs = null;
		return self::check($record, $schema, "");
	}

	public static function isValid(array $record): bool {
		return self::validate($record) === [];
	}

	/**
	 * Validiert einen AVefi-Record gegen eine Klasse des echten Schemas
	 * (WorkVariant / Manifestation / Item). @return string[]
	 */
	public static function validateAvefi(array $data, string $className): array {
		$model = self::avefiModel();
		if ($model === null || !isset($model['$defs'][$className])) return [];
		self::$refDefs = $model['$defs'];
		$errors = self::check($data, $model['$defs'][$className], "");
		self::$refDefs = null;
		return $errors;
	}

	private static function avefiModel(): ?array {
		$p = self::avefiSchemaPath();
		if (!array_key_exists($p, self::$avefiCache)) {
			$raw = @file_get_contents($p);
			self::$avefiCache[$p] = $raw !== false ? (json_decode($raw, true) ?: null) : null;
		}
		return self::$avefiCache[$p];
	}

	private static function check($data, array $schema, string $path): array {
		// $ref auflösen
		if (isset($schema['$ref']) && self::$refDefs !== null) {
			$name = substr($schema['$ref'], strrpos($schema['$ref'], "/") + 1);
			if (isset(self::$refDefs[$name])) return self::check($data, self::$refDefs[$name], $path);
			return [];
		}
		// anyOf: gültig, wenn irgendein Zweig passt
		if (isset($schema["anyOf"]) && is_array($schema["anyOf"])) {
			foreach ($schema["anyOf"] as $sub) {
				if (self::check($data, $sub, $path) === []) return [];
			}
			return [self::err($path, "passt zu keiner erlaubten Variante")];
		}

		$errors = [];

		if (isset($schema["type"]) && !self::isTypeAny($data, $schema["type"])) {
			return [self::err($path, "muss vom Typ " . self::typeStr($schema["type"]) . " sein")];
		}
		if (isset($schema["enum"]) && !in_array($data, $schema["enum"], true)) {
			$errors[] = self::err($path, "hat einen unzulässigen Wert („" . self::scalar($data) . "“)");
		}
		if (is_string($data) && isset($schema["pattern"]) && !self::matches($schema["pattern"], $data)) {
			$errors[] = self::err($path, "hat ein ungültiges Format");
		}
		if (is_string($data) && isset($schema["minLength"]) && mb_strlen($data) < (int)$schema["minLength"]) {
			$errors[] = self::err($path, "darf nicht leer sein");
		}
		if (is_int($data) || is_float($data)) {
			if (isset($schema["minimum"]) && $data < $schema["minimum"]) $errors[] = self::err($path, "ist zu klein (min. " . $schema["minimum"] . ")");
			if (isset($schema["maximum"]) && $data > $schema["maximum"]) $errors[] = self::err($path, "ist zu groß (max. " . $schema["maximum"] . ")");
		}

		// Objekt
		if (isset($schema["properties"]) || (($schema["type"] ?? null) === "object")) {
			$obj = is_array($data) ? $data : [];
			foreach (($schema["required"] ?? []) as $req) {
				if (!array_key_exists($req, $obj) || $obj[$req] === null || $obj[$req] === "" || $obj[$req] === []) {
					$errors[] = self::err(self::join($path, $req), "ist erforderlich");
				}
			}
			foreach (($schema["properties"] ?? []) as $prop => $psch) {
				if (array_key_exists($prop, $obj) && $obj[$prop] !== null && $obj[$prop] !== "") {
					$errors = array_merge($errors, self::check($obj[$prop], $psch, self::join($path, $prop)));
				}
			}
		}

		// Array
		if (($schema["type"] ?? null) === "array" || (isset($schema["items"]) && is_array($data) && array_is_list($data))) {
			if (is_array($data)) {
				if (isset($schema["minItems"]) && count($data) < (int)$schema["minItems"]) {
					$errors[] = self::err($path, "benötigt mindestens " . $schema["minItems"] . " Einträge");
				}
				if (isset($schema["items"])) {
					foreach ($data as $i => $item) {
						$errors = array_merge($errors, self::check($item, $schema["items"], $path . "[" . $i . "]"));
					}
				}
			}
		}

		return $errors;
	}

	private static function matches(string $pattern, string $value): bool {
		$re = "~" . str_replace("~", "\\~", $pattern) . "~u";
		$r = @preg_match($re, $value);
		if ($r === false) { $r = @preg_match("~" . str_replace("~", "\\~", $pattern) . "~", $value); }
		return $r === false ? true : ($r === 1);   // unbekanntes Pattern → nicht bemängeln
	}

	private static function isTypeAny($v, $type): bool {
		foreach ((is_array($type) ? $type : [$type]) as $t) if (self::isType($v, $t)) return true;
		return false;
	}
	private static function isType($v, string $t): bool {
		switch ($t) {
			case "string":  return is_string($v);
			case "integer": return is_int($v);
			case "number":  return is_int($v) || is_float($v);
			case "boolean": return is_bool($v);
			case "null":    return $v === null;
			case "array":   return is_array($v) && (count($v) === 0 || array_is_list($v));
			case "object":  return is_array($v) && (count($v) === 0 || !array_is_list($v));
			default:        return true;
		}
	}
	private static function typeStr($type): string { return implode("/", is_array($type) ? $type : [$type]); }
	private static function scalar($v): string { return is_scalar($v) ? (string)$v : gettype($v); }
	private static function join(string $path, string $key): string { return $path === "" ? $key : $path . "." . $key; }
	private static function err(string $path, string $msg): string { return ($path === "" ? "Record" : $path) . " " . $msg; }
}
