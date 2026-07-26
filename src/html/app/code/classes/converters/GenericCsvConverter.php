<?php
/*
 * GenericCsvConverter — generischer Konverter für tabellarische Quellen (CSV/TSV).
 * Eine Zeile = ein Work (mit ggf. einer Manifestation + einem Item).
 * Spaltenzuordnung heuristisch über RecordMapper.
 */

namespace converters;

class GenericCsvConverter implements \Converter {

	private string $delimiter;

	/** "auto" → Trennzeichen wird aus der Datei erkannt. */
	public function __construct(string $delimiter = "auto") {
		$this->delimiter = $delimiter;
	}

	public static function key(): string { return "generic_csv_v1"; }

	public function convert(string $path): iterable {
		$delim = $this->delimiter === "auto" ? \Csv::sniff($path, ",") : $this->delimiter;

		$fh = new \SplFileObject($path, "r");
		$fh->setFlags(\SplFileObject::READ_CSV | \SplFileObject::SKIP_EMPTY | \SplFileObject::DROP_NEW_LINE);
		$fh->setCsvControl($delim, '"', "");

		$headers = null;
		$rowNum  = 0;
		foreach ($fh as $cells) {
			if ($cells === [null] || $cells === false) continue;   // Leerzeile
			if ($headers === null) {
				$headers = array_map(fn($c) => self::stripBom((string)$c), $cells);
				continue;
			}
			$rowNum++;
			$assoc = [];
			foreach ($headers as $i => $h) {
				$assoc[$h] = $cells[$i] ?? null;
			}
			if (\RecordMapper::isEmptyRow($assoc)) continue;
			yield \RecordMapper::fromAssoc($assoc, basename($path), $rowNum);
		}
	}

	private static function stripBom(string $s): string {
		return preg_replace('/^\xEF\xBB\xBF/', "", $s) ?? $s;
	}
}
