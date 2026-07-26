<?php
/*
 * Fingerprint — Struktur-Fingerabdruck einer Quelldatei (für die Registry) plus
 * eine kleine Struktur-Probe (columns/sample) für das Format-Review.
 *
 *   analyze(): ["fingerprint"=>sha1, "columns"=>[…], "sample"=>[…]]
 */

class Fingerprint {

	public static function analyze(string $path, ?string $baseFormat): array {
		switch ($baseFormat) {
			case "csv": return self::table($path, Csv::sniff($path, ","));
			case "tsv": return self::table($path, "\t");
			case "json": return self::json($path);
			default:    return self::xml($path);   // xml/ead/marcxml
		}
	}

	/** CSV/TSV: sortierte, normalisierte Header. */
	private static function table(string $path, string $delimiter): array {
		$fh = new \SplFileObject($path, "r");
		$fh->setFlags(\SplFileObject::READ_CSV | \SplFileObject::DROP_NEW_LINE);
		$fh->setCsvControl($delimiter, '"', "");

		$headers = [];
		$sample  = [];
		$i = 0;
		foreach ($fh as $cells) {
			if ($cells === [null] || $cells === false) continue;
			if ($i === 0) {
				$headers = array_map(fn($c) => preg_replace('/^\xEF\xBB\xBF/', "", (string)$c), $cells);
			} elseif ($i <= 3) {
				$sample[] = $cells;
			} else break;
			$i++;
		}
		$norm = array_map(fn($h) => mb_strtolower(trim((string)$h)), $headers);
		sort($norm);
		return [
			"fingerprint" => sha1("table:" . implode(",", $norm)),
			"columns"     => $headers,
			"sample"      => $sample,
		];
	}

	/** JSON: sortierte Top-Level-Keys (+ Keys des ersten Array-Elements). */
	private static function json(string $path): array {
		$raw  = file_get_contents($path);
		$data = $raw !== false ? json_decode($raw, true) : null;
		$keys = [];
		$sample = [];
		if (is_array($data)) {
			if (array_is_list($data)) {
				$first = $data[0] ?? [];
				if (is_array($first)) $keys = array_keys($first);
				$sample = array_slice($data, 0, 2);
			} else {
				$keys = array_keys($data);
				$sample = [$data];
			}
		}
		$norm = array_map(fn($k) => mb_strtolower((string)$k), $keys);
		sort($norm);
		return [
			"fingerprint" => sha1("json:" . implode(",", $norm)),
			"columns"     => $keys,
			"sample"      => $sample,
		];
	}

	/** XML/EAD/MARC-XML: Root-Element + Namespace + Set der Kind-Element-Namen. */
	private static function xml(string $path): array {
		$root = ""; $ns = ""; $children = [];
		$r = new \XMLReader();
		if (@$r->open($path)) {
			$depth0Seen = false;
			while (@$r->read()) {
				if ($r->nodeType !== \XMLReader::ELEMENT) continue;
				if (!$depth0Seen) {
					$root = $r->localName;
					$ns   = (string)$r->namespaceURI;
					$depth0Seen = true;
				} elseif ($r->depth === 1) {
					$children[$r->localName] = true;
					if (count($children) > 60) break;
				}
			}
			$r->close();
		}
		$names = array_keys($children);
		sort($names);
		return [
			"fingerprint" => sha1("xml:" . $root . "|" . $ns . "|" . implode(",", $names)),
			"columns"     => $names,
			"sample"      => ["root" => $root, "namespace" => $ns, "children" => $names],
		];
	}
}
