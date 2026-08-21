<?php
/*
 * MappingRunner — führt ein Mapping-Profil auf Quellzeilen aus.
 *
 * Je Zeile: Spalte → Vorkette → Ziel(e) mit Nachkette → AvefiBuilder → kanonischer
 * AVefi-Datensatz. Zusätzlich Festwerte (defaults) und die Werkbildung über einen
 * konfigurierten Schlüssel.
 *
 * Derselbe Code bedient die Live-Vorschau im Editor und die echte Konvertierung.
 * Eine zweite Implementierung im Browser wäre schneller, würde aber bedeuten, dass
 * Vorschau und Ergebnis auseinanderlaufen können.
 */

class MappingRunner {

	private array $mapping;
	private array $columns;      // Spalte => Spezifikation
	private array $defaults;
	private array $grouping;

	/** Sammelstelle für den Prüfbericht: Spalte => ["errors"=>n, "samples"=>[…]] */
	private array $columnIssues = [];
	private int $valueErrors = 0;

	public function __construct(array $mapping) {
		$this->mapping  = $mapping;
		$this->columns  = is_array($mapping["columns"] ?? null) ? $mapping["columns"] : [];
		$this->defaults = is_array($mapping["defaults"] ?? null) ? $mapping["defaults"] : [];
		$this->grouping = is_array($mapping["grouping"] ?? null) ? $mapping["grouping"] : [];
	}

	/* ---------------- Statische Prüfung (Entwurfszeit) ---------------- */

	/**
	 * Prüft das Profil ohne Daten: unbekannte Ziele, Typkonflikte, Kardinalität,
	 * fehlende Pflichtangaben. „nogo" blockiert das Speichern, „warn" nicht.
	 * @return array<int,array{level:string,column:?string,message:string,fix:?array}>
	 */
	public function staticCheck(): array {
		$out = [];
		$hasWorkTitle = false;

		foreach ($this->columns as $col => $spec) {
			if (!is_array($spec) || !empty($spec["ignore"])) continue;
			$pre = is_array($spec["pre"] ?? null) ? $spec["pre"] : [];

			foreach (($spec["targets"] ?? []) as $t) {
				$key    = (string)($t["target"] ?? "");
				$target = TargetCatalog::get($key);
				if ($target === null) {
					$out[] = ["level" => "nogo", "column" => (string)$col,
					          "message" => "Unbekanntes Ziel „{$key}“", "fix" => null];
					continue;
				}
				if ($key === "work.title.primary") $hasWorkTitle = true;

				$post  = is_array($t["post"] ?? null) ? $t["post"] : [];
				$chain = array_merge($pre, $post);

				$res = Transform::chainType($chain, "text");
				foreach ($res["errors"] as $e) {
					$out[] = ["level" => "warn", "column" => (string)$col, "message" => $e, "fix" => null];
				}

				$want = TargetCatalog::expectedChainType($target);
				$got  = $res["type"];

				if ($got === "list" && !$target["multi"]) {
					$out[] = ["level" => "nogo", "column" => (string)$col,
						"message" => "„{$target['label']}“ nimmt nur einen Wert auf, die Kette liefert aber eine Liste. "
						           . "Ergänze „Element auswählen“ oder „Zusammenfügen“.",
						"fix" => ["op" => "take", "index" => 1]];
					continue;
				}
				if ($want === "number" && $got !== "number") {
					$out[] = ["level" => "warn", "column" => (string)$col,
						"message" => "„{$target['label']}“ erwartet eine Zahl.",
						"fix" => ["op" => "number"]];
				}
				if ($target["type"] === "duration" && !self::chainHas($chain, "duration")) {
					$out[] = ["level" => "warn", "column" => (string)$col,
						"message" => "„{$target['label']}“ erwartet das ISO-Format PT01H30M00S.",
						"fix" => ["op" => "duration", "unit" => "minutes"]];
				}
				if ($target["type"] === "date" && !self::chainHas($chain, "date") && !self::chainHas($chain, "year")) {
					$out[] = ["level" => "warn", "column" => (string)$col,
						"message" => "„{$target['label']}“ erwartet ein Datum im ISO-Format.",
						"fix" => ["op" => "date"]];
				}
				if (self::chainHas($chain, "authority") && !AvefiBuilder::acceptsAuthority($target)) {
					$out[] = ["level" => "warn", "column" => (string)$col,
						"message" => "„Normdaten nachschlagen“ wirkt bei „{$target['label']}“ nicht — "
						           . "gefundene IDs lassen sich nur an Personen, Schlagwörtern, Orten, "
						           . "Genres und Kennungs-Zielen hinterlegen.",
						"fix" => null];
				}
				if (str_starts_with($target["type"], "enum:") && !self::chainHas($chain, "valuemap")) {
					$out[] = ["level" => "warn", "column" => (string)$col,
						"message" => "„{$target['label']}“ hat eine feste Werteliste — ohne Zuordnung werden "
						           . "abweichende Schreibweisen beanstandet.",
						"fix" => ["op" => "valuemap"]];
				}
			}
		}

		foreach ($this->defaults as $d) {
			$key = (string)($d["target"] ?? "");
			if ($key === "work.title.primary") $hasWorkTitle = true;
			if (!TargetCatalog::exists($key)) {
				$out[] = ["level" => "nogo", "column" => null,
				          "message" => "Festwert zeigt auf ein unbekanntes Ziel „{$key}“", "fix" => null];
			}
		}

		if (!$hasWorkTitle) {
			$out[] = ["level" => "warn", "column" => null,
				"message" => "Keine Spalte auf „Werk › Haupttitel“ gemappt. Ersatzweise wird der Titel der "
				           . "Fassung oder des Exemplars übernommen.", "fix" => null];
		}
		return $out;
	}

	private static function chainHas(array $chain, string $op): bool {
		foreach ($chain as $s) if (is_array($s) && ($s["op"] ?? "") === $op) return true;
		return false;
	}

	public function hasBlocker(): bool {
		foreach ($this->staticCheck() as $i) if ($i["level"] === "nogo") return true;
		return false;
	}

	/* ---------------- Ausführung ---------------- */

	/**
	 * Wendet das Profil auf eine Zeile an.
	 * @return array{canonical:array,cells:array<string,array>,errors:string[]}
	 */
	public function runRow(array $row, string $baseId): array {
		$builder = new AvefiBuilder();
		$cells   = [];
		$errors  = [];
		$ctx     = ["row" => $row];

		foreach ($this->columns as $col => $spec) {
			$col = (string)$col;
			if (!is_array($spec) || !empty($spec["ignore"])) continue;
			$targets = is_array($spec["targets"] ?? null) ? $spec["targets"] : [];
			if (!$targets) continue;

			$raw = (string)($row[$col] ?? "");
			$pre = Transform::run(is_array($spec["pre"] ?? null) ? $spec["pre"] : [], $raw, $ctx);
			$cellErrors = $pre["errors"];
			$outputs = [];

			foreach ($targets as $t) {
				$key    = (string)($t["target"] ?? "");
				$target = TargetCatalog::get($key);
				if ($target === null) { $cellErrors[] = "Unbekanntes Ziel „{$key}“"; continue; }

				$post = Transform::run(is_array($t["post"] ?? null) ? $t["post"] : [], $pre["value"], $ctx);
				$cellErrors = array_merge($cellErrors, $post["errors"]);
				foreach ($post["notes"] as $n) $builder->addNote($col, $n);

				// Normdaten-Treffer nach Quellwert bündeln: Der Wert bleibt der Name,
				// die ID hängt der Builder als same_as an die erzeugte Entität.
				$found = [];
				foreach (array_merge($pre["enrich"] ?? [], $post["enrich"] ?? []) as $e) {
					$found[(string)$e["value"]][] = $e;
				}

				$values = is_array($post["value"]) ? $post["value"] : [$post["value"]];
				if (!$target["multi"]) $values = array_slice($values, 0, 1);

				foreach ($values as $v) {
					$errs = $builder->write($target, $v, $found[(string)$v] ?? []);
					$cellErrors = array_merge($cellErrors, $errs);
					if (!$errs && is_scalar($v) && trim((string)$v) !== "") {
						$out = ["target" => $key, "label" => $target["path"] ?? $target["label"], "value" => (string)$v];
						$ids = array_column($found[(string)$v] ?? [], "id");
						if ($ids) $out["ids"] = $ids;
						$outputs[] = $out;
					}
				}
			}

			if ($cellErrors) {
				$this->valueErrors += count($cellErrors);
				if (!isset($this->columnIssues[$col])) $this->columnIssues[$col] = ["errors" => 0, "samples" => []];
				$this->columnIssues[$col]["errors"] += count($cellErrors);
				foreach ($cellErrors as $e) {
					if (count($this->columnIssues[$col]["samples"]) < 5
						&& !in_array($e, $this->columnIssues[$col]["samples"], true)) {
						$this->columnIssues[$col]["samples"][] = $e;
					}
				}
			}
			$cells[$col] = ["raw" => $raw, "outputs" => $outputs, "errors" => $cellErrors];
			$errors = array_merge($errors, array_map(fn($e) => "{$col}: {$e}", $cellErrors));
		}

		// Festwerte zuletzt, damit sie nur füllen, was die Quelle nicht liefert.
		foreach ($this->defaults as $d) {
			$target = TargetCatalog::get((string)($d["target"] ?? ""));
			if ($target === null) continue;
			$builder->write($target, (string)($d["value"] ?? ""));
		}

		return ["canonical" => $builder->build($baseId), "cells" => $cells, "errors" => $errors];
	}

	/* ---------------- Werkbildung ---------------- */

	/** Ist eine Zusammenfassung von Zeilen zu Werken eingeschaltet? */
	public function groupsWorks(): bool {
		return !empty($this->grouping["work"]["by"]);
	}

	/** Klartext der verwendeten Regel für den Prüfbericht. */
	public function groupingLabel(): string {
		$by = $this->grouping["work"]["by"] ?? [];
		if (!$by) return "keine Zusammenfassung — jede Zeile ein eigenes Werk";
		$parts = [];
		foreach ($by as $k) {
			$k = (string)$k;
			if (str_starts_with($k, "column:")) { $parts[] = "Spalte „" . substr($k, 7) . "“"; continue; }
			if (str_starts_with($k, "target:")) {
				$t = TargetCatalog::get(substr($k, 7));
				$parts[] = $t !== null ? $t["label"] : substr($k, 7);
				continue;
			}
			$parts[] = $k;
		}
		return implode(" + ", $parts);
	}

	/**
	 * Schlüssel, unter dem eine Zeile zu einem Werk gehört (oder null = kein Merge).
	 * Bevorzugt auf gemappte Zielwerte statt Rohspalten: nach trim und lowercase
	 * fallen „Die Wilden Kerle " und „die wilden kerle" zusammen, vorher nicht.
	 */
	public function workKey(array $row, array $canonical): ?string {
		$by = $this->grouping["work"]["by"] ?? [];
		if (!$by) return null;
		$parts = [];
		foreach ($by as $k) {
			$k = (string)$k;
			if (str_starts_with($k, "column:")) {
				$parts[] = mb_strtolower(trim((string)($row[substr($k, 7)] ?? "")));
			} elseif (str_starts_with($k, "target:")) {
				$parts[] = mb_strtolower(trim(self::readTarget($canonical, substr($k, 7))));
			}
		}
		$joined = implode("\x1f", $parts);
		return trim($joined, "\x1f ") === "" ? null : md5($joined);
	}

	/** Liest den ersten Wert eines Ziels aus einem kanonischen Datensatz. */
	public static function readTarget(array $canonical, string $key): string {
		$target = TargetCatalog::get($key);
		if ($target === null) return "";
		$level = $target["level"];
		$node  = $level === "work" ? ($canonical["work"] ?? [])
		       : ($level === "manifestation" ? ($canonical["manifestations"][0] ?? []) : ($canonical["items"][0] ?? []));
		if (!is_array($node)) return "";
		$w = $target["writer"];

		switch ($w["kind"]) {
			case "title":      return (string)($node["has_primary_title"]["has_name"] ?? "");
			case "prop":       return (string)($node[$w["prop"]] ?? "");
			case "strlist":    return (string)(($node[$w["prop"]] ?? [""])[0] ?? "");
			case "named":      return (string)(($node[$w["prop"]][0]["has_name"] ?? ""));
			case "subject":    return (string)(($node["has_subject"][0]["has_name"] ?? ""));
			case "duration":   return (string)($node["has_duration"]["has_value"] ?? "");
			case "extent":     return (string)($node["has_extent"]["has_value"] ?? "");
			case "identifier": return (string)(($node["has_identifier"][0]["id"] ?? ""));
			case "sameas":     return (string)(($node["same_as"][0]["id"] ?? ""));
			case "eventdate":
				foreach (($node["has_event"] ?? []) as $e)
					if (($e["category"] ?? null) === $w["category"]) return (string)($e["has_date"] ?? "");
				return "";
			case "eventplace":
				foreach (($node["has_event"] ?? []) as $e)
					if (($e["category"] ?? null) === $w["category"]) return (string)($e["located_in"][0]["has_name"] ?? "");
				return "";
			case "activity":
				foreach (($node["has_event"] ?? []) as $e) {
					foreach (($e["has_activity"] ?? []) as $a) {
						if (($a["category"] ?? null) === $w["category"]) return (string)($a["has_agent"][0]["has_name"] ?? "");
					}
				}
				return "";
			case "language":   return (string)(($node["in_language"][0]["code"] ?? ""));
		}
		return "";
	}

	/**
	 * Führt zwei kanonische Datensätze desselben Werks zusammen: Werkangaben werden
	 * ergänzt (nicht überschrieben), Fassungen und Exemplare angehängt.
	 */
	public static function merge(array $base, array $add): array {
		$base["work"] = self::mergeNode($base["work"] ?? [], $add["work"] ?? []);
		$workId = null;
		foreach (($base["work"]["has_identifier"] ?? []) as $i) {
			if (($i["category"] ?? null) === "avefi:LocalResource") { $workId = (string)$i["id"]; break; }
		}
		foreach (($add["manifestations"] ?? []) as $m) {
			if ($workId !== null) $m["is_manifestation_of"] = [["category" => "avefi:LocalResource", "id" => $workId]];
			$base["manifestations"][] = $m;
		}
		foreach (($add["items"] ?? []) as $it) $base["items"][] = $it;
		return $base;
	}

	/** Ergänzt fehlende Felder; Listen werden vereinigt, Skalare nicht überschrieben. */
	private static function mergeNode(array $a, array $b): array {
		foreach ($b as $k => $v) {
			if (!array_key_exists($k, $a)) { $a[$k] = $v; continue; }
			if (is_array($a[$k]) && is_array($v) && array_is_list($a[$k]) && array_is_list($v)) {
				foreach ($v as $e) {
					if (!in_array($e, $a[$k], true)) $a[$k][] = $e;
				}
			}
		}
		return $a;
	}

	/* ---------------- Bericht ---------------- */

	public function columnIssues(): array { return $this->columnIssues; }
	public function valueErrorCount(): int { return $this->valueErrors; }
}
