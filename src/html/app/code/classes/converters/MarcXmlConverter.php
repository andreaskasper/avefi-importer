<?php
/*
 * MarcXmlConverter — MARC 21 (MARCXML). Ein <record> = ein Work.
 * Streamt über XMLReader, extrahiert je Record per DOMXPath (namespace-agnostisch).
 */

namespace converters;

class MarcXmlConverter implements \Converter {

	public static function key(): string { return "marcxml_v1"; }

	public function convert(string $path): iterable {
		$reader = new \XMLReader();
		if (!@$reader->open($path)) throw new \RuntimeException("MARC-XML nicht lesbar.");

		$i = 0;
		while (@$reader->read()) {
			if ($reader->nodeType !== \XMLReader::ELEMENT || $reader->localName !== "record") continue;

			$doc  = new \DOMDocument();
			$node = @$reader->expand($doc);
			if (!$node) { continue; }
			$doc->appendChild($node);
			$xp = new \DOMXPath($doc);

			$i++;
			$rec = $this->mapRecord($xp, $node, basename($path), $i);
			$reader->next();          // nicht in die Record-Kinder absteigen
			yield $rec;
		}
		$reader->close();
	}

	private function mapRecord(\DOMXPath $xp, \DOMNode $rec, string $file, int $i): array {
		$title = $this->sub($xp, $rec, "245", "a");
		$sub   = $this->sub($xp, $rec, "245", "b");
		if ($title !== null && $sub !== null) $title .= " " . $sub;

		$cf008 = $this->controlfield($xp, $rec, "008");
		$year  = \Xml::year($this->sub($xp, $rec, "264", "c") ?? $this->sub($xp, $rec, "260", "c"))
			?? (($cf008 !== null && strlen($cf008) >= 11) ? \Xml::year(substr($cf008, 7, 4)) : null);

		$lang    = $this->sub($xp, $rec, "041", "a")
			?? (($cf008 !== null && strlen($cf008) >= 38) ? trim(substr($cf008, 35, 3)) : null);
		$country = $this->sub($xp, $rec, "044", "a")
			?? (($cf008 !== null && strlen($cf008) >= 18) ? (trim(substr($cf008, 15, 3)) ?: null) : null);

		$work = [
			"title"        => $title,
			"titles_additional" => [],
			"year"         => $year,
			"work_type"    => null,
			"country"      => $country ?: null,
			"genre"        => $this->sub($xp, $rec, "655", "a"),
			"language"     => $lang ?: null,
			"description"  => $this->sub($xp, $rec, "520", "a"),
			"contributors" => $this->contributors($xp, $rec),
		];

		$manifestations = [];
		$extent = $this->sub($xp, $rec, "300", "a");
		$date   = $this->sub($xp, $rec, "264", "c") ?? $this->sub($xp, $rec, "260", "c");
		if ($extent !== null || $date !== null) {
			$manifestations[] = array_filter([
				"carrier"      => $extent,
				"duration_min" => \Xml::minutes($extent),
				"date"         => $date,
			], fn($v) => $v !== null && $v !== "");
		}

		$items = [];
		$inst = $this->sub($xp, $rec, "852", "a");
		$sig  = $this->sub($xp, $rec, "852", "j") ?? $this->sub($xp, $rec, "852", "h");
		$loc  = $this->sub($xp, $rec, "852", "c") ?? $this->sub($xp, $rec, "852", "b");
		if ($inst !== null || $sig !== null || $loc !== null) {
			$items[] = array_filter([
				"holding_institution" => $inst,
				"signature"           => $sig,
				"location"            => $loc,
			], fn($v) => $v !== null && $v !== "");
		}

		return ["work" => $work, "manifestations" => $manifestations, "items" => $items, "source" => ["file" => $file, "row" => $i]];
	}

	/** @return array<int,array{role:string,name:string}> */
	private function contributors(\DOMXPath $xp, \DOMNode $rec): array {
		$out = [];
		$q = ".//*[local-name()='datafield'][@tag='100' or @tag='110' or @tag='111' or @tag='700' or @tag='710' or @tag='711']";
		$fields = $xp->query($q, $rec);
		if ($fields === false) return $out;
		foreach ($fields as $df) {
			$name = $this->subIn($xp, $df, "a");
			if ($name === null) continue;
			$role = $this->subIn($xp, $df, "e") ?? $this->subIn($xp, $df, "4") ?? "contributor";
			$out[] = ["role" => $role, "name" => $name];
		}
		return $out;
	}

	private function sub(\DOMXPath $xp, \DOMNode $rec, string $tag, string $code): ?string {
		$n = $xp->query(".//*[local-name()='datafield'][@tag='" . $tag . "']/*[local-name()='subfield'][@code='" . $code . "']", $rec);
		if ($n !== false && $n->length > 0) { $v = \Xml::clean($n->item(0)->textContent); return $v !== "" ? $v : null; }
		return null;
	}

	private function subIn(\DOMXPath $xp, \DOMNode $df, string $code): ?string {
		$n = $xp->query("./*[local-name()='subfield'][@code='" . $code . "']", $df);
		if ($n !== false && $n->length > 0) { $v = \Xml::clean($n->item(0)->textContent); return $v !== "" ? $v : null; }
		return null;
	}

	private function controlfield(\DOMXPath $xp, \DOMNode $rec, string $tag): ?string {
		$n = $xp->query(".//*[local-name()='controlfield'][@tag='" . $tag . "']", $rec);
		return ($n !== false && $n->length > 0) ? $n->item(0)->textContent : null;
	}
}
