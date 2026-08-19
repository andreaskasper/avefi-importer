<?php
/*
 * TargetCatalog — kuratierte Liste der Ziele, auf die eine Quellspalte gemappt
 * werden kann, plus die Bauanleitung für den jeweiligen AVefi-Knoten.
 *
 * Warum kuratiert und nicht freier JSONPath: AVefi ist tief verschachtelt. Eine
 * Regie-Spalte landet unter has_event → ProductionEvent → has_activity →
 * DirectingActivity → has_agent → has_name. Das kann eine Kuratorin nicht tippen,
 * und jeder Tippfehler erzeugt schemawidriges JSON. Der Katalog nennt stattdessen
 * „Werk › Regie › Name" und weiß selbst, wie der Knoten entsteht.
 *
 * Enums, Muster und Pflichtfelder stammen aus SchemaModel, damit der Katalog dem
 * echten av-efi-schema folgt und nicht daneben altert.
 *
 * Jeder Eintrag:
 *   key      stabiler Bezeichner im Profil (z. B. "work.activity.directing")
 *   label    Klartext für die Oberfläche
 *   level    work | manifestation | item
 *   group    Gruppierung in der Auswahlliste
 *   type     text | date | duration | number | enum:<Enum> | id:<Resource> | lang
 *   multi    darf mehrfach vorkommen (Liste) — sonst gewinnt der erste Wert
 *   writer   Bauanleitung, siehe AvefiBuilder
 */

class TargetCatalog {

	private static ?array $cache = null;

	/** Tätigkeiten, die als Ziel angeboten werden: key => [Kategorie, Typ, Label]. */
	private const ACTIVITIES = [
		"directing"      => ["avefi:DirectingActivity",         "Director",          "Regie"],
		"writing"        => ["avefi:WritingActivity",           "Writer",            "Drehbuch"],
		"cinematography" => ["avefi:CinematographyActivity",    "Cinematographer",   "Kamera"],
		"editing"        => ["avefi:EditingActivity",           "FilmEditor",        "Schnitt"],
		"music"          => ["avefi:MusicActivity",             "Composer",          "Musik"],
		"sound"          => ["avefi:SoundActivity",             "SoundDesigner",     "Ton"],
		"producing"      => ["avefi:ProducingActivity",         "Producer",          "Produktion"],
		"company"        => ["avefi:ProducingActivity",         "ProductionCompany", "Produktionsfirma"],
		"cast"           => ["avefi:CastActivity",              "CastMember",        "Darstellung"],
		"design"         => ["avefi:ProductionDesignActivity",  "ProductionDesigner", "Ausstattung"],
		"animation"      => ["avefi:AnimationActivity",         "Animator",          "Animation"],
	];

	/** Normdaten-Ziele je Ebene: Resource-Typ => Label. */
	private const SAME_AS = [
		"work" => ["GNDResource" => "GND", "WikidataResource" => "Wikidata", "VIAFResource" => "VIAF",
		           "FilmportalResource" => "filmportal.de", "EIDRResource" => "EIDR"],
	];

	/** @return array<string,array<string,mixed>>  key => Eintrag */
	public static function all(): array {
		if (self::$cache !== null) return self::$cache;
		$t = [];

		/* ---------------- Werk ---------------- */
		$t["work.title.primary"] = self::e("Haupttitel", "work", "Titel", "text", false,
			["kind" => "title", "titleType" => "PreferredTitle", "primary" => true]);
		$t["work.title.alternative"] = self::e("Weiterer Titel", "work", "Titel", "text", true,
			["kind" => "title", "titleType" => "AlternativeTitle", "primary" => false]);
		$t["work.title.series"] = self::e("Reihentitel", "work", "Titel", "text", true,
			["kind" => "title", "titleType" => "SeriesTitle", "primary" => false]);

		$t["work.type"] = self::e("Werkart", "work", "Werk", "enum:WorkVariantTypeEnum", false,
			["kind" => "prop", "prop" => "type"]);
		$t["work.variant_type"] = self::e("Fassungsart", "work", "Werk", "enum:VariantTypeEnum", false,
			["kind" => "prop", "prop" => "variant_type"]);
		$t["work.form"] = self::e("Form (Dokumentarfilm, Kurzfilm …)", "work", "Werk", "enum:WorkFormEnum", true,
			["kind" => "strlist", "prop" => "has_form"]);
		$t["work.genre"] = self::e("Genre", "work", "Werk", "text", true,
			["kind" => "named", "prop" => "has_genre"]);

		$t["work.production.date"] = self::e("Produktionsjahr / -datum", "work", "Produktion", "date", false,
			["kind" => "eventdate", "category" => "avefi:ProductionEvent"]);
		$t["work.production.place"] = self::e("Produktionsland / -ort", "work", "Produktion", "text", true,
			["kind" => "eventplace", "category" => "avefi:ProductionEvent"]);

		foreach (self::ACTIVITIES as $k => [$cat, $type, $label]) {
			$t["work.activity.{$k}"] = self::e($label, "work", "Beteiligte", "text", true,
				["kind" => "activity", "category" => $cat, "type" => $type,
				 "agentType" => ($k === "company" ? "CorporateBody" : "Person")]);
		}

		$t["work.subject.topic"]  = self::e("Schlagwort", "work", "Erschließung", "text", true,
			["kind" => "subject", "class" => "Subject"]);
		$t["work.subject.person"] = self::e("Person (Thema)", "work", "Erschließung", "text", true,
			["kind" => "subject", "class" => "Agent", "agentType" => "Person"]);
		$t["work.subject.corporate"] = self::e("Körperschaft (Thema)", "work", "Erschließung", "text", true,
			["kind" => "subject", "class" => "Agent", "agentType" => "CorporateBody"]);
		$t["work.subject.place"]  = self::e("Ort (Thema)", "work", "Erschließung", "text", true,
			["kind" => "subject", "class" => "GeographicName"]);

		$t["work.identifier.local"] = self::e("Lokale Werk-ID", "work", "Kennungen", "id:LocalResource", true,
			["kind" => "identifier", "resource" => "LocalResource"]);
		$t["work.identifier.avefi"] = self::e("AVefi-PID des Werks", "work", "Kennungen", "id:AVefiResource", true,
			["kind" => "identifier", "resource" => "AVefiResource"]);
		foreach (self::SAME_AS["work"] as $res => $label) {
			$t["work.same_as." . strtolower(str_replace("Resource", "", $res))] =
				self::e("Verknüpfung " . $label, "work", "Kennungen", "id:{$res}", true,
					["kind" => "sameas", "resource" => $res]);
		}

		/* ---------------- Fassung (Manifestation) ---------------- */
		$t["manifestation.title.primary"] = self::e("Titel der Fassung", "manifestation", "Fassung", "text", false,
			["kind" => "title", "titleType" => "TitleProper", "primary" => true]);
		$t["manifestation.publication.date"] = self::e("Veröffentlichungsdatum", "manifestation", "Fassung", "date", false,
			["kind" => "eventdate", "category" => "avefi:PublicationEvent", "type" => "ReleaseEvent"]);
		$t["manifestation.note"] = self::e("Anmerkung zur Fassung", "manifestation", "Fassung", "text", true,
			["kind" => "strlist", "prop" => "has_note"]);
		$t["manifestation.webresource"] = self::e("Weblink zur Fassung", "manifestation", "Fassung", "text", true,
			["kind" => "strlist", "prop" => "has_webresource"]);
		$t["manifestation.identifier.local"] = self::e("Lokale Fassungs-ID", "manifestation", "Fassung", "id:LocalResource", true,
			["kind" => "identifier", "resource" => "LocalResource"]);

		/* ---------------- Exemplar (Item) ---------------- */
		$t["item.title.primary"] = self::e("Titel des Exemplars", "item", "Exemplar", "text", false,
			["kind" => "title", "titleType" => "TitleProper", "primary" => true]);
		$t["item.identifier.local"] = self::e("Signatur / lokale Exemplar-ID", "item", "Exemplar", "id:LocalResource", true,
			["kind" => "identifier", "resource" => "LocalResource"]);
		$t["item.identifier.avefi"] = self::e("AVefi-PID des Exemplars", "item", "Exemplar", "id:AVefiResource", true,
			["kind" => "identifier", "resource" => "AVefiResource"]);
		$t["item.element_type"] = self::e("Elementart (Negativ, Positiv, DCP …)", "item", "Technik", "enum:ItemElementTypeEnum", false,
			["kind" => "prop", "prop" => "element_type"]);
		$t["item.colour_type"] = self::e("Farbe", "item", "Technik", "enum:ColourTypeEnum", false,
			["kind" => "prop", "prop" => "has_colour_type"]);
		$t["item.sound_type"] = self::e("Ton", "item", "Technik", "enum:SoundTypeEnum", false,
			["kind" => "prop", "prop" => "has_sound_type"]);
		$t["item.frame_rate"] = self::e("Bildfrequenz", "item", "Technik", "enum:FrameRateEnum", false,
			["kind" => "prop", "prop" => "has_frame_rate"]);
		$t["item.access_status"] = self::e("Zugangsstatus", "item", "Technik", "enum:ItemAccessStatusEnum", false,
			["kind" => "prop", "prop" => "has_access_status"]);
		$t["item.duration"] = self::e("Laufzeit", "item", "Technik", "duration", false,
			["kind" => "duration"]);
		$t["item.extent.metre"] = self::e("Länge in Metern", "item", "Technik", "number", false,
			["kind" => "extent", "unit" => "Metre"]);
		$t["item.extent.feet"] = self::e("Länge in Fuß", "item", "Technik", "number", false,
			["kind" => "extent", "unit" => "Feet"]);

		$t["item.language.spoken"]      = self::e("Sprache (gesprochen)", "item", "Sprache", "lang", true,
			["kind" => "language", "usage" => "SpokenLanguage"]);
		$t["item.language.subtitles"]   = self::e("Sprache (Untertitel)", "item", "Sprache", "lang", true,
			["kind" => "language", "usage" => "Subtitles"]);
		$t["item.language.intertitles"] = self::e("Sprache (Zwischentitel)", "item", "Sprache", "lang", true,
			["kind" => "language", "usage" => "Intertitles"]);

		$t["item.note"] = self::e("Anmerkung zum Exemplar", "item", "Exemplar", "text", true,
			["kind" => "strlist", "prop" => "has_note"]);
		$t["item.webresource"] = self::e("Weblink zum Exemplar", "item", "Exemplar", "text", true,
			["kind" => "strlist", "prop" => "has_webresource"]);
		$t["item.preservation.date"] = self::e("Datum der Erhaltungsmaßnahme", "item", "Exemplar", "date", false,
			["kind" => "eventdate", "category" => "avefi:PreservationEvent"]);
		$t["item.manufacture.date"] = self::e("Herstellungsdatum der Kopie", "item", "Exemplar", "date", false,
			["kind" => "eventdate", "category" => "avefi:ManufactureEvent"]);

		foreach ($t as $key => &$entry) $entry["key"] = $key;
		unset($entry);

		self::$cache = $t;
		return $t;
	}

	private static function e(string $label, string $level, string $group, string $type, bool $multi, array $writer): array {
		return ["label" => $label, "level" => $level, "group" => $group,
		        "type" => $type, "multi" => $multi, "writer" => $writer];
	}

	public static function get(string $key): ?array {
		return self::all()[$key] ?? null;
	}

	public static function exists(string $key): bool {
		return isset(self::all()[$key]);
	}

	/** Ebenen-Label für die Oberfläche. */
	public static function levelLabel(string $level): string {
		switch ($level) {
			case "work":          return "Werk";
			case "manifestation": return "Fassung";
			case "item":          return "Exemplar";
			default:              return $level;
		}
	}

	/**
	 * Katalog fürs Frontend: ohne Bauanleitung, dafür mit aufgelösten Enum-Werten
	 * und Mustern — die Oberfläche soll Wertelisten anbieten können.
	 */
	public static function forFrontend(): array {
		$out = [];
		foreach (self::all() as $key => $e) {
			$row = [
				"key"   => $key,
				"label" => $e["label"],
				"level" => $e["level"],
				"levelLabel" => self::levelLabel($e["level"]),
				"group" => $e["group"],
				"type"  => $e["type"],
				"multi" => $e["multi"],
				"path"  => self::levelLabel($e["level"]) . " › " . $e["group"] . " › " . $e["label"],
			];
			if (str_starts_with($e["type"], "enum:")) {
				$row["enum"] = SchemaModel::enum(substr($e["type"], 5));
			}
			if (str_starts_with($e["type"], "id:")) {
				$row["pattern"] = SchemaModel::resourceIdPattern(substr($e["type"], 3));
			}
			$out[] = $row;
		}
		return $out;
	}

	/**
	 * Erwarteter Kettentyp eines Ziels für die statische Prüfung:
	 * „number" verlangt eine Zahl, alles andere einen Text bzw. eine Liste davon.
	 */
	public static function expectedChainType(array $target): string {
		return $target["type"] === "number" ? "number" : "text";
	}

	/**
	 * Prüft einen fertigen Wert gegen die Zielbeschränkung.
	 * @return string[]  Beanstandungen (leer = in Ordnung)
	 */
	public static function validateValue(array $target, $value): array {
		$v = is_scalar($value) ? trim((string)$value) : "";
		if ($v === "") return [];
		$type = $target["type"];

		if (str_starts_with($type, "enum:")) {
			$vals = SchemaModel::enum(substr($type, 5));
			if ($vals && !in_array($v, $vals, true)) {
				return ["„{$v}“ ist kein zulässiger Wert für „{$target['label']}“"];
			}
			return [];
		}
		if (str_starts_with($type, "id:")) {
			$pat = SchemaModel::resourceIdPattern(substr($type, 3));
			if ($pat !== null && @preg_match("/" . str_replace("/", "\\/", $pat) . "/u", $v) !== 1) {
				return ["„{$v}“ passt nicht zum Kennungsmuster von „{$target['label']}“"];
			}
			return [];
		}
		if ($type === "duration") {
			if (!preg_match('/^PT\d{2,}H[0-5]\dM[0-5]\dS$/', $v)) {
				return ["„{$v}“ ist keine schemakonforme Laufzeit (erwartet PT01H30M00S)"];
			}
			return [];
		}
		if ($type === "date") {
			if (!preg_match('/^-?\d{4}(-\d{2}(-\d{2})?)?[?~]?$/', $v)) {
				return ["„{$v}“ ist kein zulässiges Datum (erwartet JJJJ, JJJJ-MM oder JJJJ-MM-TT)"];
			}
			return [];
		}
		if ($type === "number") {
			if (!is_numeric($v)) return ["„{$v}“ ist keine Zahl"];
			return [];
		}
		if ($type === "lang") {
			$codes = SchemaModel::enum("LanguageCodeEnum");
			if ($codes && !in_array($v, $codes, true)) {
				return ["„{$v}“ ist kein ISO-639-2-Sprachcode (erwartet z. B. „ger“, „eng“)"];
			}
			return [];
		}
		return [];
	}
}
