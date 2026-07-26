<?php
/*
 * GenericJsonConverter — generischer Konverter für JSON-Quellen.
 * Top-Level-Array → ein Record je Element; Top-Level-Objekt → ein Record.
 * (Verschachtelte Werte werden zu Strings zusammengefasst; Feldzuordnung über RecordMapper.)
 */

namespace converters;

class GenericJsonConverter implements \Converter {

	public static function key(): string { return "generic_json_v1"; }

	public function convert(string $path): iterable {
		$raw  = file_get_contents($path);
		$data = $raw !== false ? json_decode($raw, true) : null;
		if (!is_array($data)) return;

		$rows = array_is_list($data) ? $data : [$data];
		$rowNum = 0;
		foreach ($rows as $row) {
			if (!is_array($row)) continue;
			$rowNum++;
			$assoc = [];
			foreach ($row as $k => $v) {
				$assoc[(string)$k] = is_scalar($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE);
			}
			if (\RecordMapper::isEmptyRow($assoc)) continue;
			yield \RecordMapper::fromAssoc($assoc, basename($path), $rowNum);
		}
	}
}
