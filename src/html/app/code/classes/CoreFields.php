<?php
/*
 * CoreFields — Belegung der vier Kernfelder eines AVefi-Datensatzes.
 *
 * Im Termin am 18.08.2026 gewünscht: eine Belegungsstatistik für Titel, Regie,
 * Produktionsdatum und Produktionsland, dazu eine „4 von 4"-Zahl als Hinweis auf
 * Datensätze, die sich für einen Abgleich mit anderen Häusern eignen. Datensätze
 * mit allen vier Angaben lassen sich verlässlich wiedererkennen; bei zweien wird
 * jede Zusammenführung zum Ratespiel.
 */

class CoreFields {

	public const FIELDS = [
		"titel"            => "Haupttitel",
		"regie"            => "Regie",
		"produktionsdatum" => "Produktionsdatum",
		"produktionsland"  => "Produktionsland",
	];

	/** Welche Kernfelder sind in diesem Datensatz belegt? @return array<string,bool> */
	public static function presence(array $canonical): array {
		$work = is_array($canonical["work"] ?? null) ? $canonical["work"] : [];

		$titel = trim((string)($work["has_primary_title"]["has_name"] ?? "")) !== "";

		$regie = false; $datum = false; $land = false;
		foreach (($work["has_event"] ?? []) as $ev) {
			if (!is_array($ev)) continue;
			if (trim((string)($ev["has_date"] ?? "")) !== "") $datum = true;
			foreach (($ev["located_in"] ?? []) as $g) {
				if (trim((string)($g["has_name"] ?? "")) !== "") $land = true;
			}
			foreach (($ev["has_activity"] ?? []) as $act) {
				if (($act["category"] ?? null) !== "avefi:DirectingActivity") continue;
				foreach (($act["has_agent"] ?? []) as $a) {
					if (trim((string)($a["has_name"] ?? "")) !== "") $regie = true;
				}
			}
		}
		return ["titel" => $titel, "regie" => $regie, "produktionsdatum" => $datum, "produktionsland" => $land];
	}

	/** Sammelt die Belegung über viele Datensätze. */
	public static function newTally(): array {
		return ["records" => 0, "fields" => array_fill_keys(array_keys(self::FIELDS), 0),
		        "complete" => array_fill_keys(["0", "1", "2", "3", "4"], 0)];
	}

	public static function add(array $tally, array $canonical): array {
		$p = self::presence($canonical);
		$tally["records"]++;
		$n = 0;
		foreach ($p as $k => $v) if ($v) { $tally["fields"][$k]++; $n++; }
		$tally["complete"][(string)$n]++;
		return $tally;
	}

	/** Ergänzt Prozentwerte für die Anzeige. */
	public static function finish(array $tally): array {
		$n = max(1, (int)$tally["records"]);
		$tally["percent"] = [];
		foreach ($tally["fields"] as $k => $v) $tally["percent"][$k] = (int)round($v * 100 / $n);
		$tally["all_four"] = (int)($tally["complete"]["4"] ?? 0);
		$tally["all_four_percent"] = (int)round($tally["all_four"] * 100 / $n);
		$tally["labels"] = self::FIELDS;
		return $tally;
	}
}
