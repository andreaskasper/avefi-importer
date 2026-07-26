<?php
/*
 * \worker\detect — Format/Fingerprint bestimmen und entweder einen convert-Job
 * einreihen oder den Import ins Format-Review schicken.
 * Wird vom worker-Daemon über \worker\detect::run($payload) aufgerufen.
 */

namespace worker;

class detect {

	public static function run(array $payload): void {
		$importId = (string)($payload["import_id"] ?? "");
		$import   = $importId !== "" ? \Import::byId($importId) : null;
		if ($import === null) throw new \RuntimeException("Import nicht gefunden.");

		$path = \Storage::firstOrgFile($import->id());
		if ($path === null) throw new \RuntimeException("Originaldatei fehlt.");

		$base     = $import->baseFormat();
		$analysis = \Fingerprint::analyze($path, $base);
		$fp       = (string)$analysis["fingerprint"];
		$import->setFingerprint($fp);

		$key = \FingerprintRegistry::resolve($fp) ?? \ConverterFactory::genericKey($base, $analysis);

		if ($key !== null) {
			$profileId = \FormatProfile::ensure($key, \ConverterFactory::label($key), $base);
			$import->setFormatProfile($profileId);
			$import->setStatus("converting");
			\WorkerJob::enqueue("convert", ["import_id" => $import->id(), "converter_key" => $key], $import->id());
			echo "[detect] {$import->filename()} → {$key}\n";
			return;
		}

		\FormatReview::open($import->id(), $fp, [
			"columns" => $analysis["columns"] ?? [],
			"sample"  => $analysis["sample"] ?? [],
		]);
		$import->setStatus("awaiting_format_review");
		echo "[detect] {$import->filename()} → Format-Review (unbekanntes Format)\n";
	}
}
