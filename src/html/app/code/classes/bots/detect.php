<?php
/*
 * detect-Bot — verarbeitet detect-Jobs: Format/Fingerprint bestimmen und
 * entweder einen convert-Job einreihen (bekanntes/generisches Format) oder den
 * Import ins Format-Review schicken.
 *
 *   php app/bot.php -t detect            (einmal die Queue leeren)
 *   php app/bot.php -t detect -r --sleep 30   (als Dauerdienst)
 */

namespace bots;

class detect {

	public static function run(array $atts = []): void {
		$total = 0; $toConvert = 0; $toReview = 0;
		while (($job = \Job::claim("detect")) !== null) {
			try {
				$outcome = self::process($job);
				\Job::complete((int)$job["id"]);
				$total++;
				$outcome === "review" ? $toReview++ : $toConvert++;
			} catch (\Throwable $e) {
				\Job::fail((int)$job["id"], $e->getMessage());
				self::markError($job);
				echo "[detect] Job #{$job['id']} fehlgeschlagen: " . $e->getMessage() . "\n";
			}
		}
		echo "[detect] {$total} verarbeitet ({$toConvert} → convert, {$toReview} → review)\n";
	}

	private static function process(array $job): string {
		$importId = (string)($job["import_id"] ?? "");
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
			\Job::enqueue("convert", $import->id(), ["converter_key" => $key]);
			echo "[detect] {$import->filename()} → {$key}\n";
			return "convert";
		}

		\FormatReview::open($import->id(), $fp, [
			"columns" => $analysis["columns"] ?? [],
			"sample"  => $analysis["sample"] ?? [],
		]);
		$import->setStatus("awaiting_format_review");
		// TODO: Admin-Benachrichtigung per E-Mail ("neues Format hochgeladen").
		echo "[detect] {$import->filename()} → Format-Review (unbekanntes Format)\n";
		return "review";
	}

	private static function markError(array $job): void {
		$id = (string)($job["import_id"] ?? "");
		if ($id === "") return;
		$import = \Import::byId($id);
		if ($import) $import->setStatus("error");
	}
}
