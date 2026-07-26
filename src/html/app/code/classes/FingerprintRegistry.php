<?php
/*
 * FingerprintRegistry — HARDCODED Zuordnung  fingerprint => converter_key.
 *
 * Für exakt bekannte Formate (z. B. „DFI-CSV v3") wird hier der Fingerprint
 * eingetragen, sobald ein passender Converter existiert. Neue/unbekannte
 * Fingerprints liefern null → der Import landet im Format-Review.
 *
 * (Generische Konvertierung ohne exakten Treffer regelt ConverterFactory::genericKey().)
 */

final class FingerprintRegistry {

	/** fingerprint => converter_key */
	private const MAP = [
		// 'a1b2…'  => 'dfi_csv_v3',
		// 'c4e2…'  => 'kinemathek_tsv_v1',
	];

	public static function resolve(string $fingerprint): ?string {
		return self::MAP[$fingerprint] ?? null;
	}
}
