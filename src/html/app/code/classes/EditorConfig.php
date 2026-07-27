<?php
/*
 * EditorConfig — bündelt alle schema-getriebenen Angaben, die der Vue-Editor
 * braucht: Enums, Titel-/Werk-Typen, Subject-Arten (mit erlaubten Authority-Quellen),
 * Tätigkeits-/Ereignis-Kategorien und Resource-Typen (mit id-Pattern).
 *
 * So bleiben Dropdowns und das ID-Gating automatisch am echten av-efi-schema.
 */

class EditorConfig {

	/** Kuratiertes Label-Mapping Subject-Art → AVefi-Klasse. */
	private const SUBJECT_KINDS = [
		["kind" => "subject",   "label" => "Schlagwort",   "class" => "Subject",         "agentType" => null],
		["kind" => "person",    "label" => "Person",       "class" => "Agent",           "agentType" => "Person"],
		["kind" => "corporate", "label" => "Körperschaft",  "class" => "Agent",           "agentType" => "CorporateBody"],
		["kind" => "place",     "label" => "Ort",           "class" => "GeographicName",  "agentType" => null],
	];

	/** Kuratierte Tätigkeitsbereiche (Beteiligte) → Activity-Klasse + Typ-Enum. */
	private const ACTIVITY_CATEGORIES = [
		["category" => "avefi:DirectingActivity",         "label" => "Regie",          "enum" => "DirectingActivityTypeEnum"],
		["category" => "avefi:WritingActivity",           "label" => "Drehbuch/Autor",  "enum" => "WritingActivityTypeEnum"],
		["category" => "avefi:CinematographyActivity",    "label" => "Kamera",          "enum" => "CinematographyActivityTypeEnum"],
		["category" => "avefi:EditingActivity",           "label" => "Schnitt",         "enum" => "EditingActivityTypeEnum"],
		["category" => "avefi:MusicActivity",             "label" => "Musik",           "enum" => "MusicActivityTypeEnum"],
		["category" => "avefi:SoundActivity",             "label" => "Ton",             "enum" => "SoundActivityTypeEnum"],
		["category" => "avefi:ProducingActivity",         "label" => "Produktion",      "enum" => "ProducingActivityTypeEnum"],
		["category" => "avefi:CastActivity",              "label" => "Darstellung",     "enum" => "CastActivityTypeEnum"],
		["category" => "avefi:ProductionDesignActivity",  "label" => "Ausstattung",     "enum" => "ProductionDesignActivityTypeEnum"],
		["category" => "avefi:AnimationActivity",         "label" => "Animation",       "enum" => "AnimationActivityTypeEnum"],
		["category" => "avefi:SpecialEffectsActivity",    "label" => "Spezialeffekte",  "enum" => "SpecialEffectsActivityTypeEnum"],
	];

	/** Ereignis-Kategorien → Typ-Enum (has_event). */
	private const EVENT_CATEGORIES = [
		["category" => "avefi:ProductionEvent",   "label" => "Produktion",   "enum" => "ProductionEventTypeEnum"],
		["category" => "avefi:PublicationEvent",  "label" => "Veröffentlichung", "enum" => "PublicationEventTypeEnum"],
		["category" => "avefi:PreservationEvent", "label" => "Erhaltung",    "enum" => "PreservationEventTypeEnum"],
		["category" => "avefi:ManufactureEvent",  "label" => "Herstellung",  "enum" => "ManufactureEventTypeEnum"],
		["category" => "avefi:RightsCopyrightRegistrationEvent", "label" => "Rechte/Copyright", "enum" => null],
	];

	private const RESOURCE_LABELS = [
		"GNDResource" => "GND", "WikidataResource" => "Wikidata", "VIAFResource" => "VIAF",
		"AATResource" => "Getty AAT", "TGNResource" => "Getty TGN", "FilmportalResource" => "filmportal.de",
		"EIDRResource" => "EIDR", "LocalResource" => "Lokal", "AVefiResource" => "AVefi-PID",
		"DOIResource" => "DOI", "ISILResource" => "ISIL",
	];

	public static function build(): array {
		return [
			"enums"               => SchemaModel::enums(),
			"subjectKinds"        => self::subjectKinds(),
			"activityCategories"  => self::ACTIVITY_CATEGORIES,
			"eventCategories"     => self::EVENT_CATEGORIES,
			"resourceTypes"       => self::resourceTypes(),
			"titleTypeEnum"       => "TitleTypeEnum",
			"lookupUrl"           => "/lookup",
		];
	}

	private static function subjectKinds(): array {
		$out = [];
		foreach (self::SUBJECT_KINDS as $k) {
			$types = SchemaModel::sameAsTypes($k["class"]);
			$k["sameAsTypes"] = $types;
			$k["categories"]  = array_map(fn($t) => SchemaModel::resourceCategory($t), $types);
			$k["sources"]     = AuthorityLookup::sourcesForKind($k["kind"]);
			$out[] = $k;
		}
		return $out;
	}

	/** Alle same_as-fähigen Resource-Typen mit category/pattern/label. */
	private static function resourceTypes(): array {
		$names = [];
		foreach (self::SUBJECT_KINDS as $k) $names = array_merge($names, SchemaModel::sameAsTypes($k["class"]));
		$names = array_values(array_unique(array_merge($names, ["GNDResource", "WikidataResource", "VIAFResource"])));
		$out = [];
		foreach ($names as $n) {
			$out[$n] = [
				"category" => SchemaModel::resourceCategory($n),
				"pattern"  => SchemaModel::resourceIdPattern($n),
				"label"    => self::RESOURCE_LABELS[$n] ?? $n,
			];
		}
		return $out;
	}
}
