<?php
/*
 * SchemaValidator — validiert einen internen AVefi-Record gegen
 * html/schema/avefi-record.schema.json (JSON Schema, Draft-07-Untermenge).
 *
 * Selbst-enthalten (keine Composer-Abhängigkeit). Sobald das aus av-efi-schema
 * (LinkML) generierte Voll-Schema vorliegt, kann hier auf opis/json-schema
 * umgestellt werden (steht in composer.json bereit).
 */

class SchemaValidator {

	private static ?array $schema = null;
	private static bool $loaded = false;

	public static function schemaPath(): string {
		return dirname(__DIR__, 3) . "/schema/avefi-record.schema.json";
	}

	private static function schema(): ?array {
		if (!self::$loaded) {
			self::$loaded = true;
			$raw = @file_get_contents(self::schemaPath());
			self::$schema = $raw !== false ? (json_decode($raw, true) ?: null) : null;
		}
		return self::$schema;
	}

	/** @return string[] Liste von Verstößen (leer = gültig). */
	public static function validate(array $record): array {
		$schema = self::schema();
		if ($schema === null) return [];
		return self::check($record, $schema, "");
	}

	public static function isValid(array $record): bool {
		return self::validate($record) === [];
	}

	private static function check($data, array $schema, string $path): array {
		$errors = [];

		if (isset($schema["type"]) && !self::isTypeAny($data, $schema["type"])) {
			return [self::err($path, "muss vom Typ " . self::typeStr($schema["type"]) . " sein")];
		}
		if (isset($schema["enum"]) && !in_array($data, $schema["enum"], true)) {
			$errors[] = self::err($path, "hat einen unzulässigen Wert („" . self::scalar($data) . "“)");
		}
		if (is_string($data) && isset($schema["minLength"]) && mb_strlen($data) < (int)$schema["minLength"]) {
			$errors[] = self::err($path, "darf nicht leer sein");
		}
		if ((is_int($data) || is_float($data))) {
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
				// leere/null-Werte hier überspringen — dafür greift ggf. schon "required"
				if (array_key_exists($prop, $obj) && $obj[$prop] !== null && $obj[$prop] !== "") {
					$errors = array_merge($errors, self::check($obj[$prop], $psch, self::join($path, $prop)));
				}
			}
		}

		// Array
		if (($schema["type"] ?? null) === "array" && is_array($data)) {
			if (isset($schema["minItems"]) && count($data) < (int)$schema["minItems"]) {
				$errors[] = self::err($path, "benötigt mindestens " . $schema["minItems"] . " Einträge");
			}
			if (isset($schema["items"])) {
				foreach ($data as $i => $item) {
					$errors = array_merge($errors, self::check($item, $schema["items"], $path . "[" . $i . "]"));
				}
			}
		}

		return $errors;
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
