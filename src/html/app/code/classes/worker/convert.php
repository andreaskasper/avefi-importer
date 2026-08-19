<?php
/*
 * \worker\convert — Converter laden, interne Records erzeugen, avefi.v1.json im
 * echten AVefi-Format schreiben (bzw. natives AVefi verlustfrei durchreichen) und
 * einen Parse-/Validierungsbericht (report_json) für den Fehlerreport ablegen.
 *
 * Der Report validiert genau das ausgelieferte avefi.v1.json gegen das echte
 * av-efi-schema (WorkVariant/Manifestation/Item) — inkl. Records mit falscher
 * oder fehlender category.
 */

namespace worker;

class convert {

	private const MAX_REPORTED = 200;   // Detailzeilen im Report deckeln

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

		$isNative = ($key === "avefi_json_v1");

		// Idempotent: vorhandene Records dieses Imports entfernen.
		\DB::execute("DELETE FROM records WHERE import_id = :id", [":id" => $import->id()]);

		// 1) Interne Records erzeugen (für Editor/Records-Liste).
		$count = 0; $rowErrors = 0; $idx = 0;
		$parseErrors = [];
		$avefiOut = [];   // gesammeltes AVefi-Output (nur non-native)

		try {
			foreach ($converter->convert($path) as $rec) {
				$idx++;
				try {
					\Record::create($import->id(), $rec);
					$count++;
				} catch (\Throwable $e) {
					$rowErrors++;
					self::pushError($parseErrors, "Datensatz {$idx}: " . $e->getMessage());
					continue;
				}
				if (!$isNative) {
					// Anhängen statt array_merge im Schleifenrumpf: array_merge kopiert bei jedem
					// Durchlauf das gesamte bisherige Array (quadratischer Aufwand, spürbar ab
					// einigen tausend Datensätzen).
					foreach (\AvefiMapper::toAvefi($rec, self::baseId($import->id(), $idx)) as $node) $avefiOut[] = $node;
				}
			}
		} catch (\Throwable $e) {
			// Ganze Datei nicht verwertbar (kaputtes JSON/XML o. Ä.).
			self::pushError($parseErrors, "Datei konnte nicht vollständig gelesen werden: " . $e->getMessage());
		}

		if ($count === 0 && !$parseErrors) {
			self::pushError($parseErrors, "Keine verwertbaren Datensätze gefunden — Datei evtl. leer oder fehlerhaft formatiert.");
		}

		// 2) avefi.v1.json schreiben: nativ = Passthrough des Originals, sonst = erzeugtes AVefi-Array.
		if ($isNative) {
			@copy($path, \Storage::avefiPath($import->id()));
			$avefiForReport = \AvefiMapper::records(self::readJson($path));
		} else {
			@file_put_contents(
				\Storage::avefiPath($import->id()),
				json_encode(array_values($avefiOut), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
			);
			$avefiForReport = $avefiOut;
		}

		// 3) Report: das ausgelieferte AVefi-Output gegen das echte Schema prüfen.
		$valid = 0; $invalidRecords = [];
		foreach (\AvefiMapper::validateSet($avefiForReport) as $v) {
			if (empty($v["errors"])) { $valid++; continue; }
			if (count($invalidRecords) < self::MAX_REPORTED) {
				$node = $avefiForReport[$v["index"]] ?? [];
				$invalidRecords[] = [
					"index"    => $v["index"],
					"class"    => $v["class"],
					"category" => $v["category"],
					"title"    => self::titleOf($node),
					"errors"   => array_slice($v["errors"], 0, 20),
				];
			}
		}
		$avefiTotal = count($avefiForReport);

		// Bei 0 Records zusätzlich eine zeilengenaue Diagnose (Warum ging nichts?).
		$parseDetail = $count === 0 ? \ParseDiagnostics::analyze($path, $import->baseFormat()) : null;

		$report = [
			"stage"           => "convert",
			"converter"       => $key,
			"native"          => $isNative,
			"schema"          => "av-efi-schema (WorkVariant/Manifestation/Item)",
			"summary"         => [
				"records"       => $count,                       // interne Datensätze (Dashboard)
				"avefi_records" => $avefiTotal,                  // geprüfte AVefi-Records
				"valid"         => $valid,
				"invalid"       => max(0, $avefiTotal - $valid),
				"row_errors"    => $rowErrors,
			],
			"parse_errors"    => $parseErrors,
			"parse_detail"    => $parseDetail,
			"invalid_records" => $invalidRecords,
		];
		$import->setReport($report);

		$import->setCounts($count, $rowErrors);
		$import->setStatus($count > 0 ? "converted" : "error");

		$note = $parseErrors ? " · " . count($parseErrors) . " Parse-Hinweis(e)" : "";
		echo "[convert] {$import->filename()}: {$count} Record(s), " . max(0, $avefiTotal - $valid) . " AVefi-Record(s) mit Schema-Hinweisen{$note} → avefi.v1.json\n";
	}

	private static function readJson(string $path) {
		$raw = @file_get_contents($path);
		return $raw !== false ? json_decode($raw, true) : null;
	}

	private static function titleOf(array $node): string {
		$t = $node["has_primary_title"]["has_name"] ?? null;
		return ($t !== null && trim((string)$t) !== "") ? (string)$t : "(ohne Titel)";
	}

	private static function baseId(string $importId, int $idx): string {
		return substr($importId, 0, 8) . "_r" . $idx;
	}

	private static function pushError(array &$list, string $msg): void {
		if (count($list) < self::MAX_REPORTED) $list[] = $msg;
	}
}
