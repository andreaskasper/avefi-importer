<?php
/*
 * Converter — Interface für Format-Konverter.
 * key() muss zum Eintrag in der FingerprintRegistry / ConverterFactory passen.
 */

interface Converter {

	/** Stabiler Schlüssel des Converters (converter_key). */
	public static function key(): string;

	/**
	 * Streamt die Quelldatei und liefert interne AVefi-Records.
	 * @return iterable<array>  je Element: ["work"=>…, "manifestations"=>[…], "items"=>[…], "source"=>…]
	 */
	public function convert(string $path): iterable;
}
