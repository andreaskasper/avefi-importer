<?php
/*
 * Xml — kleine Helfer für die XML-Converter (namespace-agnostisch via local-name()).
 */

class Xml {

	/** Erster Text eines Nachfahren mit gegebenem local-name (relativ zu $ctx), oder null. */
	public static function text(\DOMXPath $xp, \DOMNode $ctx, string $localName): ?string {
		$n = $xp->query(".//*[local-name()='" . $localName . "']", $ctx);
		if ($n !== false && $n->length > 0) {
			$v = self::clean($n->item(0)->textContent);
			return $v !== "" ? $v : null;
		}
		return null;
	}

	/** @return string[] Alle Texte von Nachfahren mit gegebenem local-name. */
	public static function texts(\DOMXPath $xp, \DOMNode $ctx, string $localName): array {
		$out = [];
		$n = $xp->query(".//*[local-name()='" . $localName . "']", $ctx);
		if ($n !== false) foreach ($n as $el) { $v = self::clean($el->textContent); if ($v !== "") $out[] = $v; }
		return $out;
	}

	public static function clean(string $s): string {
		return trim(preg_replace('/\s+/', " ", $s) ?? $s, " \t\n\r\0\x0B/:;,.");
	}

	public static function year(?string $s): ?int {
		return ($s !== null && preg_match('/(\d{4})/', $s, $m)) ? (int)$m[1] : null;
	}

	public static function minutes(?string $s): ?int {
		return ($s !== null && preg_match('/(\d+)\s*min/i', $s, $m)) ? (int)$m[1] : null;
	}
}
