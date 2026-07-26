<?php
/*
 * JsonLint — selbst-enthaltener JSON-Fehler-Locator.
 *
 * PHP liefert bei json_decode() keine Fehlerposition. locate() parst die Quelle
 * (nur wenn json_decode fehlschlägt) mit einem kleinen Recursive-Descent-Parser
 * und meldet die ERSTE Syntaxfehlerstelle als offset/Zeile/Spalte plus eine
 * verständliche deutsche Meldung.
 *
 *   locate($raw): ?array  → null wenn gültig, sonst
 *       ["message"=>string, "offset"=>?int, "line"=>?int, "column"=>?int]
 */

class JsonLint {

	public static function locate(string $s): ?array {
		json_decode($s);
		if (json_last_error() === JSON_ERROR_NONE) return null;

		$n = strlen($s);
		$pos = 0;
		try {
			self::ws($s, $pos, $n);
			if ($pos >= $n) throw new JsonLintError("Die Datei ist leer — es wurde ein JSON-Wert erwartet.", 0);
			self::value($s, $pos, $n);
			self::ws($s, $pos, $n);
			if ($pos < $n) throw new JsonLintError("Nach dem JSON-Wert stehen zusätzliche Zeichen.", $pos);
			// Parser sieht keinen Strukturfehler → anderer Grund (z. B. Kodierung/Tiefe).
			return self::at($s, null, self::phpReason());
		} catch (JsonLintError $e) {
			return self::at($s, $e->pos, $e->getMessage());
		}
	}

	/* ---- Recursive-Descent ---- */

	private static function value(string $s, int &$p, int $n): void {
		if ($p >= $n) throw new JsonLintError("Unerwartetes Dateiende — es wurde ein Wert erwartet.", $p);
		$c = $s[$p];
		if ($c === '{')                        { self::obj($s, $p, $n); return; }
		if ($c === '[')                        { self::arr($s, $p, $n); return; }
		if ($c === '"')                        { self::str($s, $p, $n); return; }
		if ($c === '-' || ($c >= '0' && $c <= '9')) { self::num($s, $p, $n); return; }
		if ($c === 't') { self::lit($s, $p, $n, "true"); return; }
		if ($c === 'f') { self::lit($s, $p, $n, "false"); return; }
		if ($c === 'n') { self::lit($s, $p, $n, "null"); return; }
		if ($c === "'") throw new JsonLintError("JSON erlaubt keine einfachen Anführungszeichen — bitte \" verwenden.", $p);
		throw new JsonLintError("Unerwartetes Zeichen " . self::vis($c) . " — erwartet wurde ein Wert (Objekt, Array, Zeichenkette, Zahl, true/false/null).", $p);
	}

	private static function obj(string $s, int &$p, int $n): void {
		$p++; // {
		self::ws($s, $p, $n);
		if ($p < $n && $s[$p] === '}') { $p++; return; }
		while (true) {
			self::ws($s, $p, $n);
			if ($p >= $n) throw new JsonLintError("Objekt nicht geschlossen — es fehlt „}“.", $p);
			if ($s[$p] !== '"') throw new JsonLintError("Objektschlüssel muss eine Zeichenkette in \"…\" sein.", $p);
			self::str($s, $p, $n);
			self::ws($s, $p, $n);
			if ($p >= $n || $s[$p] !== ':') throw new JsonLintError("Nach dem Schlüssel wird „:“ erwartet.", $p);
			$p++; // :
			self::ws($s, $p, $n);
			self::value($s, $p, $n);
			self::ws($s, $p, $n);
			if ($p >= $n) throw new JsonLintError("Objekt nicht geschlossen — es fehlt „}“.", $p);
			if ($s[$p] === ',') { $p++; self::ws($s, $p, $n);
				if ($p < $n && $s[$p] === '}') throw new JsonLintError("Überzähliges Komma vor „}“.", $p);
				continue;
			}
			if ($s[$p] === '}') { $p++; return; }
			throw new JsonLintError("Erwartet „,“ oder „}“ — gefunden " . self::vis($s[$p]) . ".", $p);
		}
	}

	private static function arr(string $s, int &$p, int $n): void {
		$p++; // [
		self::ws($s, $p, $n);
		if ($p < $n && $s[$p] === ']') { $p++; return; }
		while (true) {
			self::ws($s, $p, $n);
			self::value($s, $p, $n);
			self::ws($s, $p, $n);
			if ($p >= $n) throw new JsonLintError("Array nicht geschlossen — es fehlt „]“.", $p);
			if ($s[$p] === ',') { $p++; self::ws($s, $p, $n);
				if ($p < $n && $s[$p] === ']') throw new JsonLintError("Überzähliges Komma vor „]“.", $p);
				continue;
			}
			if ($s[$p] === ']') { $p++; return; }
			throw new JsonLintError("Erwartet „,“ oder „]“ — gefunden " . self::vis($s[$p]) . ".", $p);
		}
	}

	private static function str(string $s, int &$p, int $n): void {
		$start = $p;
		$p++; // opening "
		while ($p < $n) {
			$c = $s[$p];
			if ($c === '"') { $p++; return; }
			if ($c === '\\') {
				$p++;
				if ($p >= $n) break;
				$e = $s[$p];
				if (strpos('"\\/bfnrt', $e) !== false) { $p++; continue; }
				if ($e === 'u') {
					if ($p + 4 >= $n || !ctype_xdigit(substr($s, $p + 1, 4)))
						throw new JsonLintError("Ungültige Unicode-Escape-Sequenz (\\u erwartet 4 Hex-Ziffern).", $p - 1);
					$p += 5; continue;
				}
				throw new JsonLintError("Ungültige Escape-Sequenz „\\{$e}“.", $p - 1);
			}
			if (ord($c) < 0x20)
				throw new JsonLintError("Nicht-escaptes Steuerzeichen in der Zeichenkette (z. B. Zeilenumbruch).", $p);
			$p++;
		}
		throw new JsonLintError("Zeichenkette nicht abgeschlossen — es fehlt das schließende \".", $start);
	}

	private static function num(string $s, int &$p, int $n): void {
		if (preg_match('/\G-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/', $s, $m, 0, $p) && $m[0] !== '') {
			$p += strlen($m[0]);
			return;
		}
		throw new JsonLintError("Ungültige Zahl.", $p);
	}

	private static function lit(string $s, int &$p, int $n, string $word): void {
		if (substr($s, $p, strlen($word)) === $word) { $p += strlen($word); return; }
		throw new JsonLintError("Unbekanntes Schlüsselwort — meinten Sie true, false oder null?", $p);
	}

	private static function ws(string $s, int &$p, int $n): void {
		while ($p < $n && ($s[$p] === ' ' || $s[$p] === "\t" || $s[$p] === "\n" || $s[$p] === "\r")) $p++;
	}

	/* ---- Hilfen ---- */

	private static function at(string $s, ?int $offset, string $message): array {
		if ($offset === null) return ["message" => $message, "offset" => null, "line" => null, "column" => null];
		$offset = max(0, min($offset, strlen($s)));
		$before = substr($s, 0, $offset);
		$line   = substr_count($before, "\n") + 1;
		$nlPos  = strrpos($before, "\n");
		$lineStart = ($nlPos === false) ? 0 : $nlPos + 1;
		$column = mb_strlen(substr($s, $lineStart, $offset - $lineStart), "UTF-8") + 1;
		return ["message" => $message, "offset" => $offset, "line" => $line, "column" => $column];
	}

	private static function vis(string $c): string {
		$o = ord($c);
		if ($o < 0x20) return "Steuerzeichen 0x" . strtoupper(dechex($o));
		return "„{$c}“";
	}

	private static function phpReason(): string {
		$msg = function_exists("json_last_error_msg") ? json_last_error_msg() : "Syntaxfehler";
		switch (json_last_error()) {
			case JSON_ERROR_UTF8:  return "Ungültige UTF-8-Zeichen in der Datei.";
			case JSON_ERROR_DEPTH: return "Verschachtelung zu tief.";
			default:               return "JSON-Fehler: " . $msg;
		}
	}
}

/** Interne Ausnahme mit Fehler-Offset (nur von JsonLint genutzt). */
class JsonLintError extends \Exception {
	public int $pos;
	public function __construct(string $message, int $pos) { parent::__construct($message); $this->pos = $pos; }
}
