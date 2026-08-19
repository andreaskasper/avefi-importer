<?php
/*
 * MappingSuggest — Vorschläge, welches Ziel zu einer Quellspalte passt.
 *
 * Nachfolger der Heuristik in RecordMapper::classify, mit zwei Korrekturen:
 *
 *  1. Verglichen wird auf Wortebene statt auf Teilstrings. Die alte Fassung
 *     prüfte mit str_contains, wodurch „min" in „Administration" und „Termin"
 *     traf, „sign" in „Design" und „land" in „Landkreis".
 *  2. Es gewinnt nicht der erste Treffer, sondern der beste: jeder Vorschlag
 *     trägt einen Konfidenzwert, und die Oberfläche zeigt die Alternativen.
 *
 * Vorschläge werden NIE automatisch übernommen — sie sind vorausgefüllte
 * Auswahl, die der Mensch bestätigt.
 */

class MappingSuggest {

	/** Ziel => Schlüsselwörter (normalisiert, ohne Umlautauflösung). */
	private const KEYWORDS = [
		"work.title.primary"      => ["titel", "haupttitel", "originaltitel", "filmtitel", "title", "werktitel"],
		"work.title.alternative"  => ["alternativtitel", "nebentitel", "untertitel", "verleihtitel", "subtitle", "alttitel"],
		"work.title.series"       => ["reihe", "reihentitel", "serie", "serientitel", "series"],
		"work.production.date"    => ["jahr", "year", "produktionsjahr", "entstehungsjahr", "entstehung",
		                              "produktionsdatum", "datierung", "herstellungsjahr", "erscheinungsjahr"],
		"work.production.place"   => ["land", "produktionsland", "herstellungsland", "country", "produktionsort", "drehort"],
		"work.activity.directing" => ["regie", "regisseur", "regisseurin", "director", "regiefuehrung"],
		"work.activity.writing"   => ["drehbuch", "buch", "autor", "autorin", "screenplay", "writer", "skript"],
		"work.activity.cinematography" => ["kamera", "kameramann", "kamerafrau", "bildgestaltung", "camera", "cinematography"],
		"work.activity.editing"   => ["schnitt", "montage", "editor", "editing"],
		"work.activity.music"     => ["musik", "komponist", "komponistin", "music", "composer"],
		"work.activity.sound"     => ["ton", "tongestaltung", "sound"],
		"work.activity.producing" => ["produzent", "produzentin", "producer", "produktionsleitung"],
		"work.activity.company"   => ["produktionsfirma", "produktion", "herstellungsfirma", "firma", "studio", "produktionsgesellschaft"],
		"work.activity.cast"      => ["darsteller", "darstellerin", "besetzung", "mitwirkende", "cast", "rolle"],
		"work.genre"              => ["genre", "gattung"],
		"work.form"               => ["form", "werkart", "filmart", "art", "kategorie", "filmgattung"],
		"work.subject.topic"      => ["schlagwort", "schlagworte", "stichwort", "thema", "sachbegriff", "keywords", "verschlagwortung"],
		"work.subject.person"     => ["personen", "beteiligte personen"],
		"work.subject.place"      => ["ort", "orte", "geografikum", "schauplatz"],
		"work.identifier.local"   => ["werkid", "werknummer", "filmid", "filmnummer"],
		"work.same_as.gnd"        => ["gnd", "gndid", "gndnummer"],
		"work.same_as.wikidata"   => ["wikidata", "qid"],
		"work.same_as.filmportal" => ["filmportal"],

		"manifestation.publication.date" => ["urauffuehrung", "premiere", "veroeffentlichung", "erstauffuehrung", "release"],
		"manifestation.note"      => ["fassung", "fassungsanmerkung"],
		"manifestation.webresource" => ["link", "url", "weblink", "permalink", "onlineressource"],

		"item.identifier.local"   => ["signatur", "sign", "inventarnummer", "inventar", "objektnummer",
		                              "archivnummer", "kennung", "barcode", "nummer", "id"],
		"item.element_type"       => ["element", "elementart", "materialart", "kopienart", "kopietyp", "traeger", "traegermaterial", "material"],
		"item.colour_type"        => ["farbe", "farbigkeit", "colour", "color", "sw"],
		"item.sound_type"         => ["tonart", "tonformat", "tontechnik", "tonsystem", "stumm", "lichtton"],
		"item.frame_rate"         => ["bildfrequenz", "framerate", "bilder"],
		"item.access_status"      => ["zugang", "zugangsstatus", "status", "benutzung"],
		"item.duration"           => ["laufzeit", "dauer", "laenge", "spieldauer", "duration", "minuten", "spielzeit"],
		"item.extent.metre"       => ["meter", "laengem", "filmlaenge", "konfektionierung"],
		"item.extent.feet"        => ["fuss", "feet", "ft"],
		"item.language.spoken"    => ["sprache", "sprachfassung", "language", "originalsprache"],
		"item.language.subtitles" => ["untertitelsprache", "untertitel", "subtitles"],
		"item.language.intertitles" => ["zwischentitel", "intertitles"],
		"item.note"               => ["bemerkung", "bemerkungen", "anmerkung", "notiz", "kommentar", "beschreibung",
		                              "inhalt", "zustand", "standort", "lagerort", "regal", "synchronisiert", "akte", "rollen", "bildformat", "ausgeliehen"],
		"item.webresource"        => ["digitalisat", "digitalisatlink"],
	];

	/**
	 * Vorschläge für eine Spalte, bester zuerst.
	 * @return array<int,array{target:string,score:int}>
	 */
	public static function forColumn(string $header): array {
		$tokens = self::tokens($header);
		if (!$tokens) return [];

		$scores = [];
		foreach (self::KEYWORDS as $target => $words) {
			$best = 0;
			foreach ($words as $w) {
				foreach ($tokens as $t) {
					$s = self::score($t, $w);
					if ($s > $best) $best = $s;
				}
			}
			if ($best > 0) $scores[$target] = $best;
		}
		if (!$scores) return [];
		arsort($scores);

		$out = [];
		foreach (array_slice($scores, 0, 3, true) as $target => $score) {
			$out[] = ["target" => $target, "score" => $score];
		}
		return $out;
	}

	/**
	 * Bewertet ein Wort gegen ein Schlüsselwort.
	 *   100 = identisch, 70 = Wort beginnt mit dem Schlüsselwort (Signatur/sign),
	 *   50 = Schlüsselwort beginnt mit dem Wort. Reine Teilstring-Treffer in der
	 *   Wortmitte zählen NICHT — genau daher kam „Design" → Signatur.
	 */
	private static function score(string $token, string $keyword): int {
		if ($token === $keyword) return 100;
		if (mb_strlen($keyword) < 4 || mb_strlen($token) < 4) return 0;
		if (str_starts_with($token, $keyword)) return 70;
		if (str_starts_with($keyword, $token)) return 50;
		return 0;
	}

	/** Kopfzeile in Vergleichswörter zerlegen (Umlaute aufgelöst, Klammerzusätze weg). */
	private static function tokens(string $header): array {
		$h = mb_strtolower(trim($header));
		$h = strtr($h, ["ä" => "ae", "ö" => "oe", "ü" => "ue", "ß" => "ss"]);
		$h = preg_replace('/\((\d+)\)\s*$/', "", $h) ?? $h;      // „Titel (2)" → „Titel"
		$parts = preg_split('/[^a-z0-9]+/', $h) ?: [];
		$parts = array_values(array_filter($parts, fn($p) => $p !== ""));
		if (count($parts) > 1) $parts[] = implode("", $parts);   // „Entst Jahr" auch als „entstjahr"
		return $parts;
	}

	/**
	 * Vorschläge für alle Spalten.
	 * @return array<string,array<int,array{target:string,score:int}>>
	 */
	public static function forColumns(array $columns): array {
		$out = [];
		foreach ($columns as $c) {
			$s = self::forColumn((string)$c);
			if ($s) $out[(string)$c] = $s;
		}
		return $out;
	}

	/**
	 * Spalten mit wenigen verschiedenen Werten sind Vokabularkandidaten: das
	 * Ergebnis füllt eine valuemap vor, statt sie von Hand tippen zu lassen.
	 * @param array<string,array<string,int>> $distinct  Spalte => Wert => Anzahl
	 */
	public static function vocabularyCandidates(array $distinct, int $maxDistinct = 12): array {
		$out = [];
		foreach ($distinct as $col => $values) {
			$n = count($values);
			if ($n === 0 || $n > $maxDistinct) continue;
			arsort($values);
			$out[(string)$col] = array_keys($values);
		}
		return $out;
	}
}
