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

		$path = \Storage::tableFile($import->id());
		if ($path === null) throw new \RuntimeException("Originaldatei fehlt.");

		$base = $import->baseFormat();

		// Arbeitsmappen zuerst: Ein Blatt muss herausgelöst sein, bevor irgendetwas
		// von einer Tabelle sprechen kann.
		if (\Spreadsheet::isSpreadsheet($base)) {
			// Bei Kopien weiterer Blätter steht schon fest, welches gemeint ist.
			$wanted = trim((string)($payload["sheet"] ?? ""));
			if ($wanted !== "") self::useSheet($import, $path, $wanted);
			else                self::routeWorkbook($import, $path, $base);
			return;
		}

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

		// Tabellarische Quellen laufen immer über den Header-Hash und ein gespeichertes
		// Mapping-Profil — die alte Titelspalten-Heuristik als stiller Türsteher entfällt.
		if (\TableHeader::isTabular($base)) {
			self::routeTable($import, $path, $base);
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

	/**
	 * Arbeitsmappe: Blätter auflisten. Genau ein brauchbares Blatt wird sofort
	 * herausgelöst; bei mehreren entscheidet der Mensch, denn Arbeitsmappen enthalten
	 * regelmäßig Deckblätter, Legenden und Auswertungen, die niemand importieren will.
	 */
	private static function routeWorkbook(\Import $import, string $path, ?string $base): void {
		if (!\Spreadsheet::available()) {
			$import->setReport(["stage" => "detect", "parse_errors" => [\Spreadsheet::missingHint()],
				"summary" => ["records" => 0, "avefi_records" => 0, "valid" => 0, "invalid" => 0, "row_errors" => 0]]);
			$import->setStatus("error");
			return;
		}

		try {
			$sheets = \Spreadsheet::sheets($path);
		} catch (\Throwable $e) {
			$import->setReport(["stage" => "detect", "parse_errors" => ["Die Arbeitsmappe konnte nicht gelesen werden: " . $e->getMessage()],
				"summary" => ["records" => 0, "avefi_records" => 0, "valid" => 0, "invalid" => 0, "row_errors" => 0]]);
			$import->setStatus("error");
			echo "[detect] {$import->filename()} → Fehler (Arbeitsmappe nicht lesbar)\n";
			return;
		}

		$usable = array_values(array_filter($sheets, fn($s) => $s["usable"]));
		$import->setDetectedFormat("Excel · " . count($sheets) . " " . (count($sheets) === 1 ? "Blatt" : "Blätter"));

		if (!$usable) {
			$import->setReport(["stage" => "detect", "sheets" => $sheets,
				"parse_errors" => ["Kein Tabellenblatt enthält eine Kopfzeile mit mindestens zwei Spalten und einer Datenzeile."],
				"summary" => ["records" => 0, "avefi_records" => 0, "valid" => 0, "invalid" => 0, "row_errors" => 0]]);
			$import->setStatus("error");
			echo "[detect] {$import->filename()} → Fehler (kein brauchbares Blatt)\n";
			return;
		}

		if (count($usable) === 1) {
			self::useSheet($import, $path, $usable[0]["name"]);
			return;
		}

		$import->setReport(["stage" => "detect", "sheets" => $sheets,
			"summary" => ["records" => 0, "avefi_records" => 0, "valid" => 0, "invalid" => 0, "row_errors" => 0]]);
		$import->setStatus("awaiting_sheet_choice");
		echo "[detect] {$import->filename()} → " . count($usable) . " Blätter zur Auswahl\n";
	}

	/** Löst ein Blatt heraus und schickt den Import zurück in die Tabellen-Erkennung. */
	public static function useSheet(\Import $import, string $path, string $sheetName): void {
		$dest = \Storage::prepareWork($import->id(), \Spreadsheet::sheetFilename($import->filename(), $sheetName));
		$info = \Spreadsheet::extract($path, $sheetName, $dest);

		$import->setSheet($sheetName);
		$import->setDetectedFormat("Excel · Blatt „{$sheetName}“ · {$info['cols']} Spalten");
		echo "[detect] {$import->filename()} → Blatt „{$sheetName}“ ({$info['rows']} Zeilen)\n";

		self::routeTable($import, $dest, "csv");
	}

	/**
	 * CSV/TSV: Kopfzeilen-Hash bilden und ein Mapping-Profil suchen. Vorhanden und
	 * vollständig → konvertieren. Sonst pausiert der Import, bis jemand die Zuordnung
	 * gebaut hat; das ist keine Fehlersituation, sondern der vorgesehene Weg.
	 */
	private static function routeTable(\Import $import, string $path, ?string $base): void {
		$head = \TableHeader::read($path, $base, 5);
		$hash = $head["hash"];
		$import->setHeaderHash($hash);
		// Stammt die Tabelle aus einer Arbeitsmappe, soll das im Badge stehen bleiben —
		// „CSV" wäre irreführend, hochgeladen wurde eine Excel-Datei.
		$sheet = $import->sheet();
		$import->setDetectedFormat($sheet !== null
			? "Excel · Blatt „{$sheet}“ · " . count($head["columns"]) . " Spalten"
			: strtoupper((string)$base) . " · " . count($head["columns"]) . " Spalten");

		if (!$head["columns"]) {
			$import->setReport([
				"stage"   => "detect",
				"summary" => ["records" => 0, "avefi_records" => 0, "valid" => 0, "invalid" => 0, "row_errors" => 0],
				"parse_errors" => ["Die Datei enthält keine lesbare Kopfzeile."],
			]);
			$import->setStatus("error");
			echo "[detect] {$import->filename()} → Fehler (keine Kopfzeile)\n";
			return;
		}

		$profile = \MappingProfile::findOwn($import->institutionId(), $hash);
		if ($profile !== null && $profile->isComplete()) {
			$import->setMappingProfile($profile->id(), $profile->version());
			$import->setStatus("converting");
			\WorkerJob::enqueue("convert",
				["import_id" => $import->id(), "converter_key" => "mapping_profile:" . $profile->id()],
				$import->id());
			echo "[detect] {$import->filename()} → Profil „{$profile->name()}“ (v{$profile->version()})\n";
			return;
		}

		\FormatReview::open($import->id(), $hash, [
			"columns" => $head["columns"],
			"sample"  => array_slice($head["rows"], 0, 3),
		]);
		$import->setStatus("awaiting_format_review");
		echo "[detect] {$import->filename()} → Zuordnung nötig (Kopfzeile {$hash})\n";
	}
}
