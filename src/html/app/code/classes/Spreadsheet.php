<?php
/*
 * Spreadsheet — Tabellenkalkulationen (XLSX/XLS/ODS) lesen.
 *
 * Eine Arbeitsmappe ist keine Tabelle, sondern mehrere. Der Importer löst deshalb
 * jedes gewählte Blatt einzeln als CSV heraus und schickt es durch dieselbe Kette wie
 * eine hochgeladene CSV — Kopfzeilen-Hash, Profil, Konvertierung. Dadurch braucht der
 * Excel-Weg keine eigene Sonderbehandlung im Rest der Anwendung.
 *
 * Werte werden FORMATIERT gelesen. Excel legt ein Datum als Zahl ab; ungeformatiert
 * käme aus einem Drehdatum „44927" statt „12.03.1961".
 */

class Spreadsheet {

	/** Basisformate, die als Arbeitsmappe gelesen werden. */
	public const FORMATS = ["xlsx", "xls", "ods"];

	public static function isSpreadsheet(?string $baseFormat): bool {
		return $baseFormat !== null && in_array($baseFormat, self::FORMATS, true);
	}

	/** Ist die Bibliothek installiert? (vendor/ liegt nicht im Git) */
	public static function available(): bool {
		return class_exists(\PhpOffice\PhpSpreadsheet\IOFactory::class);
	}

	public static function missingHint(): string {
		return "Die Excel-Unterstützung ist nicht installiert. Im Verzeichnis app/code einmal "
		     . "„php composer install\" ausführen.";
	}

	/**
	 * Blätter einer Datei, ohne sie ganz zu laden.
	 * @return array<int,array{index:int,name:string,rows:int,cols:int,usable:bool}>
	 */
	public static function sheets(string $path): array {
		if (!self::available()) throw new \RuntimeException(self::missingHint());

		$reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($path);
		$out = [];
		foreach ($reader->listWorksheetInfo($path) as $i => $info) {
			$rows = (int)($info["totalRows"] ?? 0);
			$cols = (int)($info["totalColumns"] ?? 0);
			$out[] = [
				"index"  => $i,
				"name"   => (string)($info["worksheetName"] ?? ("Blatt " . ($i + 1))),
				"rows"   => $rows,
				"cols"   => $cols,
				// Eine Kopfzeile plus mindestens eine Datenzeile, und mehr als eine Spalte.
				"usable" => $rows >= 2 && $cols >= 2,
			];
		}
		return $out;
	}

	/**
	 * Löst ein Blatt als CSV heraus.
	 * @return array{rows:int,cols:int}
	 */
	public static function extract(string $path, string $sheetName, string $dest): array {
		if (!self::available()) throw new \RuntimeException(self::missingHint());

		$reader = \PhpOffice\PhpSpreadsheet\IOFactory::createReaderForFile($path);
		$reader->setLoadSheetsOnly($sheetName);          // nur dieses Blatt in den Speicher
		$book  = $reader->load($path);
		$sheet = $book->getSheetByName($sheetName) ?? $book->getActiveSheet();

		$fh = @fopen($dest, "w");
		if ($fh === false) throw new \RuntimeException("Blatt konnte nicht abgelegt werden.");

		$written = 0; $maxCols = 0;
		foreach ($sheet->getRowIterator() as $row) {
			$cells = $row->getCellIterator();
			$cells->setIterateOnlyExistingCells(false);

			$values = [];
			foreach ($cells as $cell) {
				// Formatiert lesen, damit Datums- und Zahlformate erhalten bleiben.
				$values[] = trim((string)$cell->getFormattedValue());
			}
			// Leere Spalten am Zeilenende abschneiden.
			while ($values && end($values) === "") array_pop($values);
			if (!$values) { if ($written === 0) continue; }   // führende Leerzeilen überspringen

			$maxCols = max($maxCols, count($values));
			fputcsv($fh, $values, ",", '"', "\\");
			$written++;
		}
		fclose($fh);

		// Leerzeilen am Ende sind für die Kopfzeilen-Erkennung belanglos, aber sie
		// verfälschen die Zeilenzahl im Bericht.
		return ["rows" => max(0, $written - 1), "cols" => $maxCols];
	}

	/** Dateiname für ein herausgelöstes Blatt. */
	public static function sheetFilename(string $original, string $sheetName): string {
		$base = preg_replace('/\.[A-Za-z0-9]{1,6}$/', "", basename($original)) ?? $original;
		return Storage::sanitizeFilename($base . " - " . $sheetName . ".csv");
	}
}
