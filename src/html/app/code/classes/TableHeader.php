<?php
/*
 * TableHeader — liest Kopfzeile und Beispielzeilen einer tabellarischen Quelle
 * (CSV/TSV) und bildet daraus den Header-Hash, unter dem ein Mapping-Profil
 * gefunden wird.
 *
 * Der Hash läuft über die normalisierten, SORTIERTEN Spaltennamen plus Basisformat.
 * Sortiert, weil das Mapping Spalten über ihren NAMEN adressiert: Exportiert
 * dieselbe Institution nächstes Jahr dieselben Spalten in anderer Reihenfolge,
 * greift das Profil weiterhin. Bei Adressierung über den Index wäre Sortieren
 * gefährlich — ein umsortierter Export würde still falsch gemappt.
 *
 * Umlaute bleiben erhalten: „Länge" und „Lange" sind verschiedene Spalten.
 */

class TableHeader {

	public const SAMPLE_ROWS = 200;

	/** Basisformate, die über Mapping-Profile laufen. */
	public static function isTabular(?string $baseFormat): bool {
		return in_array($baseFormat, ["csv", "tsv"], true);
	}

	/**
	 * Liest Struktur und Stichprobe.
	 * @return array{delimiter:string,columns:string[],raw_columns:string[],rows:array<int,array<string,string>>,hash:string,row_count:int,distinct:array<string,array<string,int>>}
	 */
	public static function read(string $path, ?string $baseFormat, int $maxRows = self::SAMPLE_ROWS): array {
		$delim = $baseFormat === "tsv" ? "\t" : \Csv::sniff($path, ",");

		$fh = new \SplFileObject($path, "r");
		$fh->setFlags(\SplFileObject::READ_CSV | \SplFileObject::DROP_NEW_LINE);
		$fh->setCsvControl($delim, '"', "");

		$raw = [];
		$cols = [];
		$rows = [];
		$distinct = [];
		$rowCount = 0;
		$i = 0;

		foreach ($fh as $cells) {
			if ($cells === [null] || $cells === false) continue;   // Leerzeile
			if ($i === 0) {
				$raw  = array_map(fn($c) => self::clean((string)$c), $cells);
				$cols = self::dedupe($raw);
				$i++;
				continue;
			}
			$rowCount++;
			if (count($rows) < $maxRows) {
				$assoc = [];
				foreach ($cols as $k => $name) $assoc[$name] = isset($cells[$k]) ? (string)$cells[$k] : "";
				if (!self::isEmptyRow($assoc)) {
					$rows[] = $assoc;
					foreach ($assoc as $name => $v) {
						$v = trim($v);
						if ($v === "") continue;
						if (!isset($distinct[$name])) $distinct[$name] = [];
						if (count($distinct[$name]) < 60) {
							$distinct[$name][$v] = ($distinct[$name][$v] ?? 0) + 1;
						}
					}
				}
			}
			$i++;
		}

		return [
			"delimiter"   => $delim,
			"columns"     => $cols,
			"raw_columns" => $raw,
			"rows"        => $rows,
			"row_count"   => $rowCount,
			"distinct"    => $distinct,
			"hash"        => self::hash($cols, $baseFormat),
		];
	}

	/** md5 über normalisierte, sortierte Spaltennamen + Basisformat. */
	public static function hash(array $columns, ?string $baseFormat): string {
		$norm = array_map(fn($c) => self::normalize((string)$c), $columns);
		sort($norm, SORT_STRING);
		return md5(((string)$baseFormat) . "|" . implode(",", $norm));
	}

	/** BOM weg, Rand trimmen, Mehrfach-Leerraum zusammenziehen. */
	public static function clean(string $h): string {
		$h = preg_replace('/^\xEF\xBB\xBF/', "", $h) ?? $h;
		$h = preg_replace('/\s+/u', " ", $h) ?? $h;
		return trim($h);
	}

	/** Vergleichsform eines Spaltennamens (Kleinschreibung, Umlaute bleiben). */
	public static function normalize(string $h): string {
		return mb_strtolower(self::clean($h));
	}

	/**
	 * Macht Spaltennamen eindeutig: zwei Spalten „Titel" werden zu „Titel" und
	 * „Titel (2)". Bei Namensadressierung wäre die zweite sonst nicht erreichbar.
	 * Namenlose Spalten bekommen „Spalte N".
	 */
	public static function dedupe(array $names): array {
		$seen = [];
		$out  = [];
		foreach (array_values($names) as $k => $n) {
			$n = self::clean((string)$n);
			if ($n === "") $n = "Spalte " . ($k + 1);
			$key = mb_strtolower($n);
			if (!isset($seen[$key])) {
				$seen[$key] = 1;
				$out[] = $n;
				continue;
			}
			$seen[$key]++;
			$cand = $n . " (" . $seen[$key] . ")";
			while (isset($seen[mb_strtolower($cand)])) {
				$seen[$key]++;
				$cand = $n . " (" . $seen[$key] . ")";
			}
			$seen[mb_strtolower($cand)] = 1;
			$out[] = $cand;
		}
		return $out;
	}

	public static function isEmptyRow(array $assoc): bool {
		foreach ($assoc as $v) if (trim((string)$v) !== "") return false;
		return true;
	}
}
