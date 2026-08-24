<?php
/*
 * CountryTable — Nachschlagewerk für Länderangaben.
 *
 * Archivlisten schreiben Länder uneinheitlich: „DE", „DEU", „D", „BRD",
 * „Deutschland", dazu untergegangene Staaten wie „CSSR" oder „DE bis 1945".
 * Die Tabelle führt all das auf einen deutschen Ländernamen samt GND-ID zurück.
 *
 * Datenherkunft: ISO 3166-1 aus Wikidata (Alpha-2, Alpha-3, deutsches Label,
 * GND-ID), historische und umgangssprachliche Formen von Hand ergänzt und gegen
 * lobid geprüft. Die Datei liegt im Repo (html/data/countries.json) — kein Dienst
 * zur Laufzeit, und Häuser können eigene Schreibweisen selbst nachtragen.
 */

class CountryTable {

	private static ?array $doc = null;
	private static ?array $index = null;

	public static function path(): string {
		return dirname(__DIR__, 3) . "/data/countries.json";
	}

	private static function doc(): array {
		if (self::$doc === null) {
			$raw = @file_get_contents(self::path());
			$d = $raw !== false ? json_decode($raw, true) : null;
			self::$doc = is_array($d) ? $d : ["laender" => [], "alias" => [], "historisch" => []];
		}
		return self::$doc;
	}

	/** Suchschlüssel → ["name"=>…, "gnd"=>…, "code"=>…] */
	private static function index(): array {
		if (self::$index !== null) return self::$index;
		$d = self::doc();
		$ix = [];

		foreach (($d["laender"] ?? []) as $a3 => $e) {
			$entry = ["name" => $e["name"], "gnd" => (string)($e["gnd"] ?? ""), "code" => $a3];
			$ix[self::key($a3)] = $entry;
			if (!empty($e["alpha2"])) $ix[self::key($e["alpha2"])] = $entry;
			$ix[self::key($e["name"])] = $entry;
		}
		foreach (($d["historisch"] ?? []) as $code => $e) {
			$entry = ["name" => $e["name"], "gnd" => (string)($e["gnd"] ?? ""), "code" => $code];
			$ix[self::key($code)] = $entry;
			$ix[self::key($e["name"])] = $entry;
		}
		// Aliase zuletzt, damit sie nichts überschreiben, was schon eindeutig ist.
		foreach (($d["alias"] ?? []) as $from => $to) {
			$t = $ix[self::key($to)] ?? null;
			if ($t !== null && !isset($ix[self::key($from)])) $ix[self::key($from)] = $t;
		}
		return self::$index = $ix;
	}

	/** Vergleichsform: Großschreibung, ohne Punkte und Mehrfach-Leerraum. */
	private static function key(string $s): string {
		$s = mb_strtoupper(trim($s));
		$s = str_replace(".", "", $s);
		return preg_replace('/\s+/u', " ", $s) ?? $s;
	}

	/**
	 * Schlägt eine Länderangabe nach.
	 * @return array{name:string,gnd:string,code:string}|null
	 */
	public static function lookup(string $value): ?array {
		$v = trim($value);
		if ($v === "") return null;
		return self::index()[self::key($v)] ?? null;
	}

	/** Wie viele Einträge kennt die Tabelle? (für Tests und Anzeige) */
	public static function size(): int {
		return count(self::doc()["laender"] ?? []);
	}
}
