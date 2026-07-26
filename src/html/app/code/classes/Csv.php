<?php
/*
 * Csv — kleine CSV-Hilfen (Trennzeichen-Erkennung).
 */

class Csv {

	/** Erkennt das Trennzeichen anhand der Kopfzeile (,;Tab|). */
	public static function sniff(string $path, string $default = ","): string {
		$fh = @fopen($path, "r");
		if ($fh === false) return $default;
		$line = fgets($fh);
		fclose($fh);
		if ($line === false) return $default;
		$line = preg_replace('/^\xEF\xBB\xBF/', "", $line) ?? $line;

		$best = $default; $bestN = 0;
		foreach ([",", ";", "\t", "|"] as $d) {
			$n = substr_count($line, $d);
			if ($n > $bestN) { $bestN = $n; $best = $d; }
		}
		return $bestN > 0 ? $best : $default;
	}
}
