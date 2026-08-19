<?php
/*
 * ProfileTableConverter — konvertiert CSV/TSV anhand eines gespeicherten
 * Mapping-Profils direkt nach AVefi.
 *
 * Ohne eingeschaltete Werkbildung wird gestreamt (eine Zeile → ein Datensatz).
 * Mit Werkbildung muss gesammelt werden, weil erst am Ende feststeht, welche Zeilen
 * zusammengehören; die Datensätze werden dann gebündelt ausgegeben.
 */

namespace converters;

class ProfileTableConverter implements \Converter, \CanonicalConverter {

	private \MappingProfile $profile;
	private \MappingRunner $runner;
	private ?string $baseFormat;
	private int $rows = 0;
	private int $works = 0;

	public function __construct(\MappingProfile $profile, ?string $baseFormat = null) {
		$this->profile    = $profile;
		$this->baseFormat = $baseFormat ?? $profile->baseFormat();
		$this->runner     = new \MappingRunner($profile->mapping());
	}

	public static function key(): string { return "mapping_profile"; }

	public function convert(string $path): iterable {
		$delim = $this->baseFormat === "tsv" ? "\t" : \Csv::sniff($path, ",");

		$fh = new \SplFileObject($path, "r");
		$fh->setFlags(\SplFileObject::READ_CSV | \SplFileObject::DROP_NEW_LINE);
		$fh->setCsvControl($delim, '"', "");

		$columns = null;
		$rowNum  = 0;
		$grouped = [];        // Werk-Schlüssel => Index in $bucket
		$bucket  = [];

		foreach ($fh as $cells) {
			if ($cells === [null] || $cells === false) continue;
			if ($columns === null) {
				$columns = \TableHeader::dedupe(array_map(fn($c) => \TableHeader::clean((string)$c), $cells));
				continue;
			}
			$assoc = [];
			foreach ($columns as $k => $name) $assoc[$name] = isset($cells[$k]) ? (string)$cells[$k] : "";
			if (\TableHeader::isEmptyRow($assoc)) continue;

			$rowNum++;
			$this->rows++;
			$res  = $this->runner->runRow($assoc, "r" . $rowNum);
			$rec  = [
				"canonical" => $res["canonical"],
				"source"    => ["file" => basename($path), "row" => $rowNum, "profile" => $this->profile->id()],
			];

			if (!$this->runner->groupsWorks()) {
				$this->works++;
				yield $rec;
				continue;
			}

			$key = $this->runner->workKey($assoc, $res["canonical"]);
			if ($key === null) { $bucket[] = $rec; continue; }   // kein Schlüssel → eigenes Werk
			if (isset($grouped[$key])) {
				$i = $grouped[$key];
				$bucket[$i]["canonical"] = \MappingRunner::merge($bucket[$i]["canonical"], $res["canonical"]);
				$bucket[$i]["source"]["rows"][] = $rowNum;
				continue;
			}
			$grouped[$key] = count($bucket);
			$rec["source"]["rows"] = [$rowNum];
			$bucket[] = $rec;
		}

		foreach ($bucket as $rec) {
			$this->works++;
			yield $rec;
		}
	}

	public function report(): array {
		return [
			"profile"        => ["id" => $this->profile->id(), "name" => $this->profile->name(),
			                     "version" => $this->profile->version()],
			"grouping"       => $this->runner->groupingLabel(),
			"rows"           => $this->rows,
			"works"          => $this->works,
			"value_errors"   => $this->runner->valueErrorCount(),
			"column_issues"  => $this->runner->columnIssues(),
		];
	}
}
