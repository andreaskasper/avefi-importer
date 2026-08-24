<?php
/*
 * AvefiBuilder — setzt aus einzelnen Zuweisungen (Ziel + Wert) einen kanonischen
 * AVefi-Datensatz zusammen: {work, manifestations[], items[]}.
 *
 * Der Builder kennt die Bauanleitungen aus TargetCatalog::writer und legt
 * verschachtelte Knoten (Ereignisse, Tätigkeiten, Sprachen) bei Bedarf an, statt
 * sie doppelt zu erzeugen: Regie und Kamera landen im selben ProductionEvent,
 * zwei Sprachangaben mit gleichem Code in derselben Language-Struktur.
 */

class AvefiBuilder {

	private array $work  = ["category" => "avefi:WorkVariant"];
	private array $manif = ["category" => "avefi:Manifestation"];
	private array $item  = ["category" => "avefi:Item"];
	private array $notes = [];        // aus valuemap-Fallback „als Notiz behalten"
	private bool  $touchedManif = false;
	private bool  $touchedItem  = false;
	private array $localIds = ["work" => null, "manifestation" => null, "item" => null];

	/**
	 * Schreibt einen Wert an sein Ziel.
	 *
	 * @param array $sameAs  Normdaten-Treffer zu diesem Wert, je [category, id, resource].
	 *                       Bei benannten Entitäten (Person, Schlagwort, Ort, Genre) werden
	 *                       sie als same_as angehängt; bei reinen Kennungs-Zielen ersetzen
	 *                       sie den Namen, weil dort die ID der Wert ist.
	 * @return string[]  Beanstandungen
	 */
	public function write(array $target, $value, array $sameAs = []): array {
		$w = $target["writer"];

		// Kennungs-Ziele: Wurde zu einem Namen eine ID gefunden, ist SIE der Wert.
		if ($sameAs && in_array($w["kind"], ["sameas", "identifier"], true)) {
			foreach ($sameAs as $r) {
				if (($r["resource"] ?? null) === ($w["resource"] ?? null)) { $value = $r["id"]; break; }
			}
		}

		$errors = TargetCatalog::validateValue($target, $value);
		if ($errors) return $errors;

		$v = is_scalar($value) ? trim((string)$value) : "";
		if ($v === "") return [];

		$level = $target["level"];
		$node  =& $this->node($level);
		if ($level === "manifestation") $this->touchedManif = true;
		if ($level === "item")          $this->touchedItem  = true;

		switch ($w["kind"]) {

			case "title":
				if (!empty($w["primary"])) {
					if (!isset($node["has_primary_title"]))
						$node["has_primary_title"] = ["has_name" => $v, "type" => $w["titleType"]];
				} else {
					$node["has_alternative_title"][] = ["has_name" => $v, "type" => $w["titleType"]];
				}
				break;

			case "prop":
				if (!isset($node[$w["prop"]])) $node[$w["prop"]] = $v;   // einwertig: der erste gewinnt
				break;

			case "strlist":
				if (!in_array($v, $node[$w["prop"]] ?? [], true)) $node[$w["prop"]][] = $v;
				break;

			case "named":
				foreach (($node[$w["prop"]] ?? []) as $i => $e) {
					if (($e["has_name"] ?? null) === $v) {
						self::mergeSameAs($node[$w["prop"]][$i], $sameAs, ["GNDResource"]);
						return [];
					}
				}
				$entry = ["has_name" => $v];
				self::mergeSameAs($entry, $sameAs, ["GNDResource"]);   // Genre erlaubt nur GND
				$node[$w["prop"]][] = $entry;
				break;

			case "subject":
				$entry = ["category" => "avefi:" . $w["class"], "has_name" => $v];
				if (isset($w["agentType"])) $entry["type"] = $w["agentType"];
				foreach (($node["has_subject"] ?? []) as $i => $e) {
					if (($e["has_name"] ?? null) === $v && ($e["category"] ?? null) === $entry["category"]) {
						self::mergeSameAs($node["has_subject"][$i], $sameAs, SchemaModel::sameAsTypes($w["class"]));
						return [];
					}
				}
				self::mergeSameAs($entry, $sameAs, SchemaModel::sameAsTypes($w["class"]));
				$node["has_subject"][] = $entry;
				break;

			case "activity":
				// Alle Mitwirkenden eines Werks teilen sich ein ProductionEvent —
				// Regie und Kamera landen also im selben Ereignis, nicht in zweien.
				$ev =& $this->event($node, "avefi:ProductionEvent", null);
				$act =& $this->activity($ev, $w["category"], $w["type"]);
				foreach (($act["has_agent"] ?? []) as $i => $a) {
					if (($a["has_name"] ?? null) === $v) {
						self::mergeSameAs($act["has_agent"][$i], $sameAs, SchemaModel::sameAsTypes("Agent"));
						return [];
					}
				}
				$agent = ["category" => "avefi:Agent", "has_name" => $v, "type" => $w["agentType"] ?? "Person"];
				self::mergeSameAs($agent, $sameAs, SchemaModel::sameAsTypes("Agent"));
				$act["has_agent"][] = $agent;
				break;

			case "eventdate":
				$ev =& $this->event($node, $w["category"], $w["type"] ?? null);
				if (!isset($ev["has_date"])) $ev["has_date"] = $v;
				break;

			case "eventplace":
				$ev =& $this->event($node, $w["category"], $w["type"] ?? null);
				foreach (($ev["located_in"] ?? []) as $i => $g) {
					if (($g["has_name"] ?? null) === $v) {
						self::mergeSameAs($ev["located_in"][$i], $sameAs, SchemaModel::sameAsTypes("GeographicName"));
						return [];
					}
				}
				$place = ["category" => "avefi:GeographicName", "has_name" => $v];
				self::mergeSameAs($place, $sameAs, SchemaModel::sameAsTypes("GeographicName"));
				$ev["located_in"][] = $place;
				break;

			case "identifier":
				$cat = SchemaModel::resourceCategory($w["resource"]);
				foreach (($node["has_identifier"] ?? []) as $e) {
					if (($e["id"] ?? null) === $v && ($e["category"] ?? null) === $cat) return [];
				}
				$node["has_identifier"][] = ["category" => $cat, "id" => $v];
				if ($w["resource"] === "LocalResource" && $this->localIds[$level] === null) {
					$this->localIds[$level] = $v;      // dient zugleich als Verknüpfungs-ID
				}
				break;

			case "sameas":
				$cat = SchemaModel::resourceCategory($w["resource"]);
				foreach (($node["same_as"] ?? []) as $e) {
					if (($e["id"] ?? null) === $v && ($e["category"] ?? null) === $cat) return [];
				}
				$node["same_as"][] = ["category" => $cat, "id" => $v];
				break;

			case "duration":
				if (!isset($node["has_duration"])) $node["has_duration"] = ["has_value" => $v];
				break;

			case "extent":
				if (!isset($node["has_extent"]) && is_numeric($v))
					$node["has_extent"] = ["has_value" => 0 + $v, "has_unit" => $w["unit"]];
				break;

			case "language":
				$found = false;
				foreach (($node["in_language"] ?? []) as $i => $l) {
					if (($l["code"] ?? null) === $v) {
						if (!in_array($w["usage"], $node["in_language"][$i]["usage"] ?? [], true))
							$node["in_language"][$i]["usage"][] = $w["usage"];
						$found = true;
						break;
					}
				}
				if (!$found) $node["in_language"][] = ["code" => $v, "usage" => [$w["usage"]]];
				break;
		}
		return [];
	}

	/** Notizen aus dem valuemap-Fallback „als Notiz behalten". */
	public function addNote(string $column, string $value): void {
		$this->notes[] = $column . ": " . $value;
	}

	public function hasWorkTitle(): bool { return isset($this->work["has_primary_title"]); }

	/** Übernimmt einen Titel aus Fassung/Exemplar, wenn das Werk keinen eigenen hat. */
	public function borrowWorkTitle(): void {
		if ($this->hasWorkTitle()) return;
		foreach ([$this->item, $this->manif] as $n) {
			$name = $n["has_primary_title"]["has_name"] ?? null;
			if (is_string($name) && trim($name) !== "") {
				$this->work["has_primary_title"] = ["has_name" => $name, "type" => "SuppliedDevisedTitle"];
				return;
			}
		}
	}

	/**
	 * Fertiger kanonischer Datensatz.
	 * @param string $baseId  Präfix für die erzeugten LocalResource-IDs
	 */
	public function build(string $baseId): array {
		$this->borrowWorkTitle();

		$work = $this->work;
		if (!isset($work["type"])) $work["type"] = "Monographic";      // Pflichtfeld im Schema

		$workId = $this->localIds["work"] ?? ($baseId . "_work");
		if ($this->localIds["work"] === null) {
			$work["has_identifier"][] = ["category" => "avefi:LocalResource", "id" => $workId];
		}

		$items = [];
		$manifs = [];

		$needManif = $this->touchedManif || $this->touchedItem;
		if ($needManif) {
			$manif   = $this->manif;
			$manifId = $this->localIds["manifestation"] ?? ($baseId . "_manifestation");
			if ($this->localIds["manifestation"] === null) {
				$manif["has_identifier"][] = ["category" => "avefi:LocalResource", "id" => $manifId];
			}
			$manif["is_manifestation_of"] = [["category" => "avefi:LocalResource", "id" => $workId]];

			if ($this->touchedItem) {
				$item   = $this->item;
				$itemId = $this->localIds["item"] ?? ($baseId . "_item");
				if ($this->localIds["item"] === null) {
					$item["has_identifier"][] = ["category" => "avefi:LocalResource", "id" => $itemId];
				}
				$item["is_item_of"] = ["category" => "avefi:LocalResource", "id" => $manifId];
				if ($this->notes) {
					foreach ($this->notes as $n) $item["has_note"][] = $n;
				}
				$items[] = $item;
			} elseif ($this->notes) {
				foreach ($this->notes as $n) $manif["has_note"][] = $n;
			}
			$manifs[] = $manif;
		}

		return ["work" => $work, "manifestations" => $manifs, "items" => $items];
	}

	/**
	 * Hängt gefundene Normdaten als same_as an eine Entität. Erlaubt sind nur die
	 * Resource-Typen, die das Schema für diese Klasse vorsieht — eine TGN-ID an einer
	 * Person wäre schemawidrig.
	 */
	private static function mergeSameAs(array &$entity, array $sameAs, array $allowedTypes): void {
		foreach ($sameAs as $r) {
			$type = (string)($r["resource"] ?? "");
			if ($allowedTypes && !in_array($type, $allowedTypes, true)) continue;
			$ref = ["category" => $r["category"], "id" => $r["id"]];
			foreach (($entity["same_as"] ?? []) as $e) {
				if (($e["id"] ?? null) === $ref["id"] && ($e["category"] ?? null) === $ref["category"]) continue 2;
			}
			$entity["same_as"][] = $ref;
		}
	}

	/** Kann dieses Ziel überhaupt Normdaten aufnehmen? */
	public static function acceptsAuthority(array $target): bool {
		return in_array($target["writer"]["kind"] ?? "",
			["activity", "subject", "named", "sameas", "identifier", "eventplace"], true);
	}

	/* ---------------- Interne Helfer ---------------- */

	private function &node(string $level): array {
		switch ($level) {
			case "manifestation": return $this->manif;
			case "item":          return $this->item;
			default:              return $this->work;
		}
	}

	/** Findet ein Ereignis der Kategorie im Knoten oder legt es an (per Referenz). */
	private function &event(array &$node, string $category, ?string $type): array {
		if (!isset($node["has_event"])) $node["has_event"] = [];
		foreach ($node["has_event"] as $i => $e) {
			if (($e["category"] ?? null) === $category) return $node["has_event"][$i];
		}
		$new = ["category" => $category];
		if ($type !== null) $new["type"] = $type;
		$node["has_event"][] = $new;
		$last = count($node["has_event"]) - 1;
		return $node["has_event"][$last];
	}

	/** Findet eine Tätigkeit im Ereignis oder legt sie an (per Referenz). */
	private function &activity(array &$event, string $category, string $type): array {
		if (!isset($event["has_activity"])) $event["has_activity"] = [];
		foreach ($event["has_activity"] as $i => $a) {
			if (($a["category"] ?? null) === $category && ($a["type"] ?? null) === $type)
				return $event["has_activity"][$i];
		}
		$event["has_activity"][] = ["category" => $category, "type" => $type, "has_agent" => []];
		$last = count($event["has_activity"]) - 1;
		return $event["has_activity"][$last];
	}
}
