<?php
/*
 * \worker\detect — Format/Fingerprint bestimmen, Format-/Schema-Label setzen und
 * entweder einen convert-Job einreihen, ins Format-Review schicken ODER (bei
 * syntaktisch kaputtem JSON/XML) den Import mit Fehlerdetails auf „error" setzen.
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

		// Syntax-Validität strukturierter Formate prüfen (JSON/XML-Familie).
		$structured = in_array($base, ["json", "xml", "ead", "marcxml"], true);
		$parseOk = true; $diag = null;
		if ($structured) {
			$diag = \ParseDiagnostics::analyze($path, $base);
			$parseOk = $diag["ok"];
		}

		// Aussagekräftiges Format-/Schema-Label fürs Badge.
		$import->setDetectedFormat(\FormatGuess::describe($base, $analysis, $parseOk));

		// Kaputte Datei → Fehler mit Detailbericht (statt Format-Review).
		if ($structured && !$parseOk) {
			$import->setReport([
				"stage"        => "detect",
				"parse_detail" => $diag,
				"summary"      => ["records" => 0, "avefi_records" => 0, "valid" => 0, "invalid" => 0, "row_errors" => 0],
			]);
			$import->setStatus("error");
			echo "[detect] {$import->filename()} → Fehler (Datei nicht parsebar)\n";
			return;
		}

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
