<?php
/*
 * ParseDiagnostics — verständliche Diagnose für nicht (sauber) verarbeitbare
 * Quelldateien. Liefert je Fehler Meldung, Position (Zeile/Spalte), einen
 * Code-Ausschnitt mit markierter Stelle sowie einen Klartext-Lösungshinweis.
 *
 *   analyze($path,$baseFormat): [
 *     "ok"     => bool,                 // false = mindestens ein fataler Fehler
 *     "format" => "JSON"|"XML"|"CSV"|…,
 *     "errors" => [ [
 *        "severity"=>"error"|"warn", "message"=>…, "line"=>?int, "column"=>?int,
 *        "hint"=>…, "snippet"=>["start"=>int,"lines"=>[["no"=>int,"text"=>…]],"error_line"=>?int,"column"=>?int]
 *     ] ],
 *   ]
 */

class ParseDiagnostics {

	private const MAX_SCAN_BYTES = 50 * 1024 * 1024;   // >50 MB: keine Zeilen-genaue Analyse

	public static function analyze(string $path, ?string $baseFormat): array {
		switch ($baseFormat) {
			case "json":                    return self::json($path);
			case "csv":  case "tsv":        return self::csv($path, $baseFormat);
			default:                        return self::xml($path);   // xml/ead/marcxml
		}
	}

	/* ---------------- JSON ---------------- */

	private static function json(string $path): array {
		$raw = @file_get_contents($path);
		if ($raw === false) return self::unreadable("JSON");
		if (strlen($raw) > self::MAX_SCAN_BYTES) {
			json_decode($raw);
			$ok = json_last_error() === JSON_ERROR_NONE;
			return ["ok" => $ok, "format" => "JSON", "errors" => $ok ? [] :
				[self::err("Die Datei ist zu groß für eine zeilengenaue Analyse. " . json_last_error_msg(), null, null, null,
					"Prüfen Sie die Datei mit einem lokalen JSON-Validator.")]];
		}
		$loc = JsonLint::locate($raw);
		if ($loc === null) return ["ok" => true, "format" => "JSON", "errors" => []];

		return ["ok" => false, "format" => "JSON", "errors" => [
			self::err($loc["message"], $loc["line"], $loc["column"], $loc["offset"], self::jsonHint($loc["message"]), $raw),
		]];
	}

	private static function jsonHint(string $message): string {
		if (str_contains($message, "Komma"))          return "Entfernen Sie das überzählige Komma bzw. ergänzen Sie ein fehlendes Komma zwischen den Einträgen.";
		if (str_contains($message, "Zeichenkette"))    return "Schließen Sie die Zeichenkette mit \" ab und escapen Sie enthaltene \" als \\\" sowie Zeilenumbrüche als \\n.";
		if (str_contains($message, "Anführungszeichen"))return "JSON verlangt doppelte Anführungszeichen (\") um Schlüssel und Text — keine einfachen (').";
		if (str_contains($message, "„:“"))             return "Zwischen Schlüssel und Wert gehört ein Doppelpunkt: \"schlüssel\": wert.";
		if (str_contains($message, "Escape"))          return "Gültige Escapes sind \\\" \\\\ \\/ \\b \\f \\n \\r \\t und \\uXXXX.";
		if (str_contains($message, "Schlüsselwort"))    return "Nur true, false und null sind erlaubt (klein geschrieben, ohne Anführungszeichen).";
		return "Prüfen Sie an der markierten Stelle Klammern, Kommas und Anführungszeichen.";
	}

	/* ---------------- XML / MARC-XML / EAD ---------------- */

	private static function xml(string $path): array {
		$raw = @file_get_contents($path);
		if ($raw === false) return self::unreadable("XML");

		$prev = libxml_use_internal_errors(true);
		libxml_clear_errors();
		$dom = new \DOMDocument();
		@$dom->loadXML($raw, LIBXML_NONET);
		$libErrors = libxml_get_errors();
		libxml_clear_errors();
		libxml_use_internal_errors($prev);

		$errors = []; $fatal = false;
		foreach ($libErrors as $e) {
			$sev = ($e->level === LIBXML_ERR_WARNING) ? "warn" : "error";
			if ($sev === "error") $fatal = true;
			$line = $e->line > 0 ? (int)$e->line : null;
			$col  = $e->column > 0 ? (int)$e->column : null;
			$errors[] = self::err(trim($e->message) . " (libxml " . $e->code . ")", $line, $col, null, self::xmlHint($e->code), $raw);
			if (count($errors) >= 50) break;
		}
		return ["ok" => !$fatal, "format" => "XML", "errors" => $errors];
	}

	private static function xmlHint(int $code): string {
		// Häufige libxml-Codes.
		switch ($code) {
			case 5:  return "Die Datei endet unerwartet — vermutlich ein nicht geschlossenes Element.";
			case 76: return "Öffnendes und schließendes Tag passen nicht zusammen (Verschachtelung prüfen).";
			case 68: return "Ungültiges Zeichen im Namen oder Wert.";
			default: return "Prüfen Sie an der markierten Stelle Tags, Verschachtelung und das Escaping von & < >.";
		}
	}

	/* ---------------- CSV / TSV ---------------- */

	private static function csv(string $path, string $base): array {
		$delim = $base === "tsv" ? "\t" : Csv::sniff($path, ",");
		$fh = @fopen($path, "r");
		if ($fh === false) return self::unreadable(strtoupper($base));

		$errors = []; $header = null; $cols = 0; $dataRows = 0; $line = 0; $ragged = 0;
		while (($cells = fgetcsv($fh, 0, $delim, '"', "")) !== false) {
			$line++;
			if ($cells === [null]) continue;   // Leerzeile
			if ($header === null) { $header = $cells; $cols = count($cells); continue; }
			$dataRows++;
			if (count($cells) !== $cols) {
				$ragged++;
				if (count($errors) < 20) {
					$errors[] = self::err(
						"Zeile hat " . count($cells) . " Felder, erwartet wurden " . $cols . " (laut Kopfzeile).",
						$line, null, null,
						"Vermutlich ein nicht-escaptes Trennzeichen oder Anführungszeichen. Felder mit " . ($base === "tsv" ? "Tab" : $delim) . " in \"…\" setzen.",
						null
					);
				}
			}
		}
		fclose($fh);

		$labelBase = strtoupper($base);
		if ($header === null) {
			return ["ok" => false, "format" => $labelBase, "errors" => [
				self::err("Keine Kopfzeile gefunden — die Datei ist leer.", 1, null, null, "Erste Zeile muss die Spaltennamen enthalten.", null)]];
		}
		if (!RecordMapper::hasTitleColumn($header)) {
			$errors[] = self::err(
				"Keine Titel-Spalte erkannt. Gefundene Spalten: " . implode(", ", array_map(fn($h) => trim((string)$h), $header)),
				1, null, null,
				"Benennen Sie die Titelspalte z. B. „Titel“, „Haupttitel“ oder „Title“ — sonst ist keine automatische Konvertierung möglich (Format-Review).",
				null
			);
		}
		if ($dataRows === 0) {
			$errors[] = self::err("Die Datei enthält nur eine Kopfzeile, aber keine Datenzeilen.", 1, null, null, "Fügen Sie mindestens eine Datenzeile hinzu.", null);
		}

		// „ok" = strukturell lesbar (uneinheitliche Zeilen/fehlende Titelspalte sind Warnungen).
		$fatal = ($dataRows === 0);
		foreach ($errors as $e) if ($e["severity"] === "error") $fatal = true;
		return ["ok" => !$fatal, "format" => $labelBase, "errors" => $errors];
	}

	/* ---------------- Bausteine ---------------- */

	private static function unreadable(string $fmt): array {
		return ["ok" => false, "format" => $fmt, "errors" => [
			self::err("Die Datei konnte nicht gelesen werden.", null, null, null, "Prüfen Sie, ob der Upload vollständig war.", null)]];
	}

	/** Baut einen Fehlereintrag inkl. optionalem Code-Ausschnitt (aus $raw). */
	private static function err(string $message, ?int $line, ?int $column, ?int $offset, string $hint, ?string $raw): array {
		$severity = str_contains($hint, "Format-Review") ? "warn" : "error";
		$e = [
			"severity" => $severity,
			"message"  => $message,
			"line"     => $line,
			"column"   => $column,
			"offset"   => $offset,
			"hint"     => $hint,
			"snippet"  => null,
		];
		if ($raw !== null && $line !== null) $e["snippet"] = self::snippet($raw, $line, $column);
		return $e;
	}

	/** Kontext-Ausschnitt: ±2 Zeilen um die Fehlerzeile. */
	private static function snippet(string $raw, int $errorLine, ?int $column): array {
		$lines = preg_split('/\r\n|\r|\n/', $raw);
		$total = count($lines);
		$from = max(1, $errorLine - 2);
		$to   = min($total, $errorLine + 2);
		$out = [];
		for ($i = $from; $i <= $to; $i++) {
			$text = $lines[$i - 1] ?? "";
			if (mb_strlen($text) > 240) $text = mb_substr($text, 0, 240) . " …";
			$out[] = ["no" => $i, "text" => $text];
		}
		return ["start" => $from, "lines" => $out, "error_line" => $errorLine, "column" => $column];
	}
}
