<?php

/*
 * EditorSchemaTest — SchemaModel, EditorConfig, AuthorityLookup-Gating,
 * kanonische AVefi-Struktur (Migration) und ein Save-Roundtrip gegen das echte Schema.
 * (Keine Netzwerkaufrufe.)
 */
class EditorSchemaTest extends \Codeception\Test\Unit
{
    protected $tester;

    /* ---------- SchemaModel ---------- */

    public function testEnumValues()
    {
        $this->assertContains("PreferredTitle", \SchemaModel::enum("TitleTypeEnum"));
        $this->assertContains("Monographic", \SchemaModel::enum("WorkVariantTypeEnum"));
        $this->assertSame([], \SchemaModel::enum("GibtEsNichtEnum"));
    }

    public function testSameAsGating()
    {
        $agent = \SchemaModel::sameAsTypes("Agent");
        $this->assertContains("GNDResource", $agent);
        $this->assertContains("WikidataResource", $agent);
        $this->assertContains("VIAFResource", $agent);
        $this->assertNotContains("AATResource", $agent);         // AAT nur bei Subject
        $this->assertContains("AATResource", \SchemaModel::sameAsTypes("Subject"));
        $this->assertSame(["GNDResource"], \SchemaModel::sameAsTypes("Genre"));
    }

    public function testResourceMeta()
    {
        $this->assertSame("avefi:WikidataResource", \SchemaModel::resourceCategory("WikidataResource"));
        $this->assertSame('^[LPQ]\d+$', \SchemaModel::resourceIdPattern("WikidataResource"));
    }

    /* ---------- AuthorityLookup (Gating, ohne Netz) ---------- */

    public function testLookupSourcesPerKind()
    {
        $this->assertSame(["gnd", "wikidata", "viaf"], \AuthorityLookup::sourcesForKind("person"));
        $this->assertSame(["gnd"], \AuthorityLookup::sourcesForKind("genre"));
    }

    public function testLookupShortQueryReturnsEmpty()
    {
        $this->assertSame([], \AuthorityLookup::search("x", "person"));
    }

    /* ---------- EditorConfig ---------- */

    public function testEditorConfig()
    {
        $cfg = \EditorConfig::build();
        foreach (["enums", "subjectKinds", "activityCategories", "eventCategories", "resourceTypes"] as $k) {
            $this->assertArrayHasKey($k, $cfg);
        }
        $this->assertArrayHasKey("TitleTypeEnum", $cfg["enums"]);
        $person = array_values(array_filter($cfg["subjectKinds"], fn($k) => $k["kind"] === "person"))[0];
        $this->assertContains("gnd", $person["sources"]);
        $this->assertContains("avefi:GNDResource", $person["categories"]);
        $this->assertSame('^[-\dX]+$', $cfg["resourceTypes"]["GNDResource"]["pattern"]);
    }

    /* ---------- kanonische Struktur / Migration ---------- */

    public function testCanonicalFromAvefiKey()
    {
        $data = ["avefi" => ["work" => ["category" => "avefi:WorkVariant", "has_primary_title" => ["has_name" => "X", "type" => "PreferredTitle"]], "manifestations" => [], "items" => []]];
        $c = \AvefiMapper::canonical($data);
        $this->assertSame("X", $c["work"]["has_primary_title"]["has_name"]);
    }

    public function testCanonicalFromNativeSource()
    {
        $native = json_decode(file_get_contents(AVEFI_SAMPLES . "/avefi-native.json"), true);
        $grouped = \AvefiMapper::group($native);
        $data = ["source" => ["avefi" => $grouped]];
        $c = \AvefiMapper::canonical($data);
        $this->assertSame("Die Reise nach Leonberg", $c["work"]["has_primary_title"]["has_name"]);
        $this->assertCount(1, $c["manifestations"]);
        $this->assertCount(1, $c["items"]);
    }

    public function testCanonicalFromLegacyInternal()
    {
        $legacy = ["work" => ["title" => "Metropolis", "year" => 1927, "work_type" => "Spielfilm"], "manifestations" => [[]], "items" => [[]]];
        $c = \AvefiMapper::canonical($legacy, "leg1");
        $this->assertSame("Metropolis", $c["work"]["has_primary_title"]["has_name"]);
        $this->assertSame("avefi:WorkVariant", $c["work"]["category"]);
    }

    public function testGroupAndFlattenRoundtrip()
    {
        $native = json_decode(file_get_contents(AVEFI_SAMPLES . "/avefi-native.json"), true);
        $g = \AvefiMapper::group($native);
        $flat = \AvefiMapper::flatten($g);
        $this->assertCount(count($native), $flat);
        $this->assertSame("avefi:WorkVariant", $flat[0]["category"]);
    }

    /* ---------- Save-Roundtrip: wie vom Editor gespeichert ---------- */

    public function testEditorSaveShapeIsSchemaValid()
    {
        // So sieht die vom Vue-serialize() erzeugte kanonische Struktur aus:
        $canonical = [
            "work" => [
                "category" => "avefi:WorkVariant", "type" => "Monographic",
                "has_primary_title" => ["has_name" => "Allein gegen alle", "type" => "PreferredTitle"],
                "has_alternative_title" => [["has_name" => "Reise nach Leonberg", "type" => "AlternativeTitle"]],
                "has_event" => [[
                    "category" => "avefi:ProductionEvent", "has_date" => "1966",
                    "has_activity" => [["category" => "avefi:DirectingActivity", "type" => "Director",
                        "has_agent" => [["category" => "avefi:Agent", "has_name" => "Hans Rosenthal", "same_as" => [["category" => "avefi:WikidataResource", "id" => "Q96197"]]]]]],
                ]],
                "has_subject" => [
                    ["category" => "avefi:Subject", "has_name" => "Quizsendung", "same_as" => [["category" => "avefi:WikidataResource", "id" => "Q2123557"]]],
                    ["category" => "avefi:Agent", "type" => "Person", "has_name" => "Rosenthal, Hans", "same_as" => [["category" => "avefi:GNDResource", "id" => "118602764"]]],
                    ["category" => "avefi:GeographicName", "has_name" => "Leonberg"],
                ],
                "has_identifier" => [["category" => "avefi:LocalResource", "id" => "LFS_work"]],
            ],
            "manifestations" => [[
                "category" => "avefi:Manifestation",
                "is_manifestation_of" => [["category" => "avefi:LocalResource", "id" => "LFS_work"]],
                "has_identifier" => [["category" => "avefi:LocalResource", "id" => "LFS_manif"]],
            ]],
            "items" => [[
                "category" => "avefi:Item",
                "is_item_of" => ["category" => "avefi:LocalResource", "id" => "LFS_manif"],
                "has_identifier" => [["category" => "avefi:LocalResource", "id" => "LFS_item"]],
                "element_type" => "Positive", "has_duration" => ["has_value" => "PT00H30M00S"],
            ]],
        ];
        $bad = 0;
        foreach (\AvefiMapper::validateSet(\AvefiMapper::flatten($canonical)) as $v) {
            if (!empty($v["errors"])) { $bad++; fwrite(STDERR, ($v["class"] ?? "?") . ": " . implode(" | ", $v["errors"]) . "\n"); }
        }
        $this->assertSame(0, $bad, "Editor-Ausgabe muss schema-gültig sein");

        $disp = \AvefiMapper::workDisplay($canonical["work"]);
        $this->assertSame("Allein gegen alle", $disp["title"]);
        $this->assertSame(1966, $disp["year"]);
        $this->assertGreaterThan(0, \Completeness::forAvefi($canonical));
    }
}
