<?php
/*
 * AvefiJsonConverter — für Quellen, die bereits natives AVefi-JSON sind
 * (Array von Records mit category "avefi:WorkVariant/Manifestation/Item", oder ein
 * MovingImageRecordContainer mit has_record). Wird NICHT neu gemappt, sondern
 * über AvefiMapper::fromAvefi in interne Records überführt; das AVefi-Original
 * bleibt je Record unter source.avefi erhalten (verlustfreier Passthrough).
 */

namespace converters;

class AvefiJsonConverter implements \Converter {

	public static function key(): string { return "avefi_json_v1"; }

	public function convert(string $path): iterable {
		$raw  = file_get_contents($path);
		$data = $raw !== false ? json_decode($raw, true) : null;
		if (!is_array($data)) {
			throw new \RuntimeException("Datei ist kein gültiges JSON.");
		}
		foreach (\AvefiMapper::fromAvefi($data, basename($path)) as $rec) {
			yield $rec;
		}
	}
}
