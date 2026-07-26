<?php
/*
 * EadConverter — EAD (Encoded Archival Description) 2002 / EAD3.
 * Jede Komponenten-<did> (Eltern <c>/<cNN>) = ein Work; die Sammlungs-<did>
 * (unter <archdesc>) wird übersprungen. Streamt über XMLReader.
 */

namespace converters;

class EadConverter implements \Converter {

	public static function key(): string { return "ead_v1"; }

	public function convert(string $path): iterable {
		$reader = new \XMLReader();
		if (!@$reader->open($path)) throw new \RuntimeException("EAD nicht lesbar.");

		$stack = [];
		$i = 0;
		while (@$reader->read()) {
			if ($reader->nodeType !== \XMLReader::ELEMENT) continue;
			$stack[$reader->depth] = $reader->localName;
			if ($reader->localName !== "did") continue;

			$parent = $stack[$reader->depth - 1] ?? "";
			if (!preg_match('/^c\d*$/', $parent)) continue;   // nur Komponenten-Ebene, nicht die Sammlung

			$doc  = new \DOMDocument();
			$node = @$reader->expand($doc);
			if (!$node) continue;
			$doc->appendChild($node);
			$xp = new \DOMXPath($doc);

			$i++;
			yield $this->mapDid($xp, $node, basename($path), $i);
		}
		$reader->close();
	}

	private function mapDid(\DOMXPath $xp, \DOMNode $did, string $file, int $i): array {
		// Datum (bevorzugt @normal)
		$dateText = null;
		$ud = $xp->query(".//*[local-name()='unitdate']", $did);
		if ($ud !== false && $ud->length > 0) {
			$el       = $ud->item(0);
			$normal   = $el instanceof \DOMElement ? $el->getAttribute("normal") : "";
			$dateText = \Xml::clean($el->textContent);
			$year     = \Xml::year($normal !== "" ? $normal : $dateText);
		} else {
			$year = null;
		}

		$sig    = \Xml::text($xp, $did, "unitid");
		$extent = \Xml::text($xp, $did, "extent");
		$dims   = \Xml::text($xp, $did, "dimensions");
		$repo   = \Xml::text($xp, $did, "repository");
		$loc    = \Xml::text($xp, $did, "physloc");

		$work = [
			"title"             => \Xml::text($xp, $did, "unittitle"),
			"titles_additional" => [],
			"year"              => $year,
			"work_type"         => null,
			"country"           => null,
			"genre"             => \Xml::text($xp, $did, "genreform"),
			"language"          => \Xml::text($xp, $did, "language"),
			"description"       => \Xml::text($xp, $did, "abstract"),
			"contributors"      => $this->contributors($xp, $did),
		];

		$manifestations = [];
		$carrier = $extent ?? $dims;
		if ($carrier !== null || $dateText !== null) {
			$manifestations[] = array_filter([
				"carrier"      => $carrier,
				"duration_min" => \Xml::minutes($extent),
				"date"         => $dateText,
			], fn($v) => $v !== null && $v !== "");
		}

		$items = [];
		if ($repo !== null || $sig !== null || $loc !== null) {
			$items[] = array_filter([
				"holding_institution" => $repo,
				"signature"           => $sig,
				"location"            => $loc,
			], fn($v) => $v !== null && $v !== "");
		}

		return ["work" => $work, "manifestations" => $manifestations, "items" => $items, "source" => ["file" => $file, "row" => $i]];
	}

	/** @return array<int,array{role:string,name:string}> */
	private function contributors(\DOMXPath $xp, \DOMNode $did): array {
		$out = [];
		$q = ".//*[local-name()='origination']//*[local-name()='persname' or local-name()='corpname' or local-name()='famname']";
		$names = $xp->query($q, $did);
		if ($names !== false) {
			foreach ($names as $el) {
				$name = \Xml::clean($el->textContent);
				if ($name === "") continue;
				$role = $el instanceof \DOMElement ? $el->getAttribute("role") : "";
				$out[] = ["role" => $role !== "" ? $role : "origination", "name" => $name];
			}
		}
		return $out;
	}
}
