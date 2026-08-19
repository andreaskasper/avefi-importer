<?php
/*
 * MappingPreview — baut die Live-Vorschau des Mapping-Editors.
 *
 * Die Vorschau zeigt je Quellspalte bis zu drei Beispiele. Sie werden GEZIELT
 * gesucht statt einfach die ersten Zeilen zu nehmen: In der Paderborner Liste ist
 * das Produktionsjahr in der ersten Zeile leer und die Regie in den ersten drei —
 * eine an Zeile 1 klebende Vorschau zeigt dort nichts und sieht aus, als sei die
 * Zuordnung kaputt. Gesucht werden deshalb je Spalte die ersten drei VERSCHIEDENEN
 * gefüllten Werte; bei Wertelisten ist das zugleich die Antwort auf die Frage, ob
 * die Zuordnung alle vorkommenden Schreibweisen abdeckt.
 *
 * Gerechnet wird nur die Vereinigungsmenge der dafür nötigen Zeilen (gedeckelt),
 * nicht die ganze Stichprobe.
 */

class MappingPreview {

	public const MAX_ROWS    = 60;   // Obergrenze gerechneter Zeilen
	public const PER_COLUMN  = 3;    // Beispiele je Spalte
	public const MAX_SCHEMA  = 25;   // verschiedene Schema-Beanstandungen im Bericht

	/**
	 * @param array $head     ["columns"=>[], "rows"=>[assoc], "row_count"=>int]
	 * @param array $mapping  Profil-Mapping
	 */
	public static function build(array $head, array $mapping,
	                             int $maxRows = self::MAX_ROWS, int $perColumn = self::PER_COLUMN): array {
		$columns = array_values($head["columns"] ?? []);
		$rows    = array_values($head["rows"] ?? []);
		$total   = (int)($head["row_count"] ?? count($rows));

		$picked = self::pickExamples($columns, $rows, $perColumn);

		// Zeile 0 ist immer dabei: sie liefert die Strukturvorschau (der AVefi-Baum
		// soll einen vollständigen Datensatz zeigen, nicht einen aus Bruchstücken).
		$needed = [];
		if ($rows) $needed[0] = true;
		foreach ($picked as $col => $info) {
			foreach ($info["examples"] as $e) $needed[$e["row"]] = true;
		}
		$needed = array_slice(array_keys($needed), 0, $maxRows);
		sort($needed);

		$runner    = new MappingRunner($mapping);
		$evaluated = [];
		$canonical = null;
		$schema    = [];

		foreach ($needed as $idx) {
			$res = $runner->runRow($rows[$idx], "vorschau" . ($idx + 1));
			$evaluated[$idx] = $res["cells"];
			if ($canonical === null) $canonical = $res["canonical"];

			foreach (AvefiMapper::validateSet(AvefiMapper::flatten($res["canonical"])) as $v) {
				foreach ($v["errors"] as $e) {
					$key = ($v["class"] ?? "?") . ": " . $e;
					if (!isset($schema[$key])) $schema[$key] = ["message" => $key, "rows" => 0];
					$schema[$key]["rows"]++;
				}
			}
		}

		// Beispiele mit ihrem gerechneten Ergebnis zusammenführen.
		$out = [];
		foreach ($columns as $col) {
			$info = $picked[$col] ?? ["filled" => 0, "examples" => []];
			$examples = [];
			foreach ($info["examples"] as $e) {
				$cell = $evaluated[$e["row"]][$col] ?? null;
				$examples[] = [
					"row"     => $e["row"] + 1,          // 1-basiert für die Anzeige
					"raw"     => $e["raw"],
					"count"   => $e["count"],
					"outputs" => $cell["outputs"] ?? [],
					"errors"  => $cell["errors"] ?? [],
				];
			}
			$out[$col] = [
				"examples" => $examples,
				"filled"   => ["n" => $info["filled"], "of" => count($rows), "total" => $total],
			];
		}

		usort($schema, fn($a, $b) => $b["rows"] <=> $a["rows"]);

		return [
			"columns"        => $out,
			"canonical"      => $canonical,
			"schema"         => array_slice(array_values($schema), 0, self::MAX_SCHEMA),
			"evaluatedRows"  => count($needed),
			"checks"         => $runner->staticCheck(),
		];
	}

	/**
	 * Je Spalte die ersten $perColumn VERSCHIEDENEN gefüllten Werte samt Zeilennummer
	 * und Häufigkeit, plus die Zahl der gefüllten Zeilen.
	 * @return array<string,array{filled:int,examples:array<int,array{row:int,raw:string,count:int}>}>
	 */
	public static function pickExamples(array $columns, array $rows, int $perColumn = self::PER_COLUMN): array {
		$out = [];
		foreach ($columns as $col) {
			$col     = (string)$col;
			$filled  = 0;
			$seen    = [];      // Wert => Position in $examples
			$examples = [];

			foreach ($rows as $i => $row) {
				$raw = trim((string)($row[$col] ?? ""));
				if ($raw === "") continue;
				$filled++;
				if (isset($seen[$raw])) { $examples[$seen[$raw]]["count"]++; continue; }
				if (count($examples) >= $perColumn) continue;   // weiterzählen, nicht abbrechen
				$seen[$raw] = count($examples);
				$examples[] = ["row" => $i, "raw" => $raw, "count" => 1];
			}
			$out[$col] = ["filled" => $filled, "examples" => $examples];
		}
		return $out;
	}
}
