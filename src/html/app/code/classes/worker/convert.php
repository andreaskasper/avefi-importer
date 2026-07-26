<?php
/*
 * \worker\convert — Converter laden, Records erzeugen, avefi.v1.json schreiben,
 * Import auf „converted" setzen.
 */

namespace worker;

class convert {

	public static function run(array $payload): void {
		$importId = (string)($payload["import_id"] ?? "");
		$import   = $importId !== "" ? \Import::byId($importId) : null;
		if ($import === null) throw new \RuntimeException("Import nicht gefunden.");

		$key = (string)($payload["converter_key"] ?? "");
		if ($key === "") throw new \RuntimeException("converter_key fehlt.");

		$converter = \ConverterFactory::make($key, $import->baseFormat());
		if ($converter === null) throw new \RuntimeException("Kein Converter für {$key}.");

		$path = \Storage::firstOrgFile($import->id());
		if ($path === null) throw new \RuntimeException("Originaldatei fehlt.");

		// Idempotent: vorhandene Records dieses Imports entfernen.
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
