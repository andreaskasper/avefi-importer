<?php
/*
 * convert-Bot — verarbeitet convert-Jobs: Converter laden, Records erzeugen,
 * completeness berechnen, Records speichern, avefi.v1.json schreiben,
 * Import auf „converted" setzen.
 *
 *   php app/bot.php -t convert            (einmal die Queue leeren)
 *   php app/bot.php -t convert -r --sleep 30
 */

namespace bots;

class convert {

	public static function run(array $atts = []): void {
		$total = 0;
		while (($job = \Job::claim("convert")) !== null) {
			try {
				self::process($job);
				\Job::complete((int)$job["id"]);
				$total++;
			} catch (\Throwable $e) {
				\Job::fail((int)$job["id"], $e->getMessage());
				$id = (string)($job["import_id"] ?? "");
				if ($id !== "") { $imp = \Import::byId($id); if ($imp) $imp->setStatus("error"); }
				echo "[convert] Job #{$job['id']} fehlgeschlagen: " . $e->getMessage() . "\n";
			}
		}
		echo "[convert] {$total} Import(e) konvertiert\n";
	}

	private static function process(array $job): void {
		$importId = (string)($job["import_id"] ?? "");
		$import   = $importId !== "" ? \Import::byId($importId) : null;
		if ($import === null) throw new \RuntimeException("Import nicht gefunden.");

		$payload = json_decode((string)($job["payload"] ?? "{}"), true) ?: [];
		$key     = (string)($payload["converter_key"] ?? "");
		if ($key === "") throw new \RuntimeException("converter_key fehlt.");

		$converter = \ConverterFactory::make($key, $import->baseFormat());
		if ($converter === null) throw new \RuntimeException("Kein Converter für {$key}.");

		$path = \Storage::firstOrgFile($import->id());
		if ($path === null) throw new \RuntimeException("Originaldatei fehlt.");

		// Idempotent: evtl. vorhandene Records dieses Imports entfernen.
		\DB::execute("DELETE FROM records WHERE import_id = :id", [":id" => $import->id()]);

		$records = []; $count = 0; $errors = 0;
		foreach ($converter->convert($path) as $rec) {
			try {
				\Record::create($import->id(), $rec);
				$records[] = $rec;
				$count++;
			} catch (\Throwable $e) {
				$errors++;
			}
		}

		$out = ["import_id" => $import->id(), "converter" => $key, "count" => $count, "records" => $records];
		@file_put_contents(
			\Storage::avefiPath($import->id()),
			json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
		);

		$import->setCounts($count, $errors);
		$import->setStatus($count > 0 ? "converted" : "error");
		echo "[convert] {$import->filename()}: {$count} Record(s), {$errors} Fehler → avefi.v1.json\n";
	}
}
