<?php

/*
 * AvefiMapperTest — internes Record-Format ↔ echtes av-efi-schema, native
 * AVefi-Erkennung/Passthrough und Schema-Validierung des gemappten Outputs.
 */
class AvefiMapperTest extends \Codeception\Test\Unit
{
    protected $tester;

    private function nativeSample(): array
    {
        return json_decode(file_get_contents(AVEFI_SAMPLES . "/avefi-native.json"), true);
    }

    private function invalidCount(array $set): int
    {
        $n = 0;
        foreach (\AvefiMapper::validateSet($set) as $v) {
            if (!empty($v["errors"])) $n++;
        }
        return $n;
    }

    /* ---------- intern → AVefi ---------- */

    public function testToAvefiProducesValidSet()
    {
        $internal = [
            "work" => [
                "title" => "Metropolis", "year" => 1927, "work_type" => "Spielfilm",
                "titles_additional" => ["Metropolis (Restaurierung)"],
                "contributors" => [["role" => "Regie", "name" => "Fritz Lang"]],
            ],
            "manifestations" => [["carrier" => "35mm", "duration_min" => 153, "date" => "1927"]],
            "items" => [["holding_institution" => "DFI", "signature" => "F-1"]],
            "source" => ["file" => "x.csv", "row" => 1],
        ];
        $set = \AvefiMapper::toAvefi($internal, "test_r1");

        $this->assertCount(3, $set);
        $this->assertSame("avefi:WorkVariant", $set[0]["category"]);
        $this->assertSame("avefi:Manifestation", $set[1]["category"]);
        $this->assertSame("avefi:Item", $set[2]["category"]);
        $this->assertSame("Metropolis", $set[0]["has_primary_title"]["has_name"]);
        $this->assertSame("Monographic", $set[0]["type"]);
        // Verlinkung über LocalResource-IDs.
        $this->assertSame("test_r1_work", $set[1]["is_manifestation_of"][0]["id"]);
        $this->assertSame("test_r1_manifestation1", $set[2]["is_item_of"]["id"]);
        // Ergebnis ist schema-gültig.
        $this->assertSame(0, $this->invalidCount($set));
    }

    public function testToAvefiSerialType()
    {
        $set = \AvefiMapper::toAvefi(["work" => ["title" => "Tatort", "work_type" => "Serie"]], "s1");
        $this->assertSame("Serial", $set[0]["type"]);
    }

    /* ---------- AVefi → intern ---------- */

    public function testFromAvefiGroupsAndPreservesOriginal()
    {
        $recs = \AvefiMapper::fromAvefi($this->nativeSample(), "avefi-native.json");
        $this->assertCount(1, $recs);
        $r = $recs[0];
        $this->assertSame("Die Reise nach Leonberg", $r["work"]["title"]);
        $this->assertSame(1965, $r["work"]["year"]);
        $this->assertCount(1, $r["manifestations"]);
        $this->assertCount(1, $r["items"]);
        // Regie aus has_activity zurückgewonnen.
        $this->assertSame("Erika Muster", $r["work"]["contributors"][0]["name"]);
        // AVefi-Original bleibt verlustfrei erhalten.
        $this->assertArrayHasKey("avefi", $r["source"]);
        $this->assertSame("avefi:WorkVariant", $r["source"]["avefi"]["work"]["category"]);
    }

    public function testRoundtripStaysValid()
    {
        $recs = \AvefiMapper::fromAvefi($this->nativeSample(), "s.json");
        $set  = \AvefiMapper::toAvefi($recs[0], "rt1");
        $this->assertSame(0, $this->invalidCount($set));
    }

    /* ---------- Validierung ---------- */

    public function testValidateAvefiFlagsBrokenRecord()
    {
        $broken = ["category" => "avefi:WorkVariant", "type" => "Spielfilm"]; // fehlt has_primary_title, type kein Enum
        $errors = \SchemaValidator::validateAvefi($broken, "WorkVariant");
        $this->assertNotEmpty($errors);
        $joined = implode(" ", $errors);
        $this->assertStringContainsString("has_primary_title", $joined);
    }

    public function testValidateAvefiAcceptsSample()
    {
        foreach ($this->nativeSample() as $rec) {
            $cls = \AvefiMapper::CLASS_BY_CATEGORY[$rec["category"]];
            $this->assertSame([], \SchemaValidator::validateAvefi($rec, $cls));
        }
    }

    /* ---------- Erkennung + Converter ---------- */

    public function testDetectsNativeAvefiJson()
    {
        $analysis = \Fingerprint::analyze(AVEFI_SAMPLES . "/avefi-native.json", "json");
        $this->assertSame("avefi_json_v1", \ConverterFactory::genericKey("json", $analysis));
    }

    public function testGenericFormatsNotMisdetectedAsAvefi()
    {
        $csv  = \Fingerprint::analyze(AVEFI_SAMPLES . "/films.csv", "csv");
        $json = \Fingerprint::analyze(AVEFI_SAMPLES . "/films.json", "json");
        $this->assertSame("generic_csv_v1", \ConverterFactory::genericKey("csv", $csv));
        $this->assertSame("generic_json_v1", \ConverterFactory::genericKey("json", $json));
    }

    public function testAvefiJsonConverterYieldsInternalRecords()
    {
        $conv = new \converters\AvefiJsonConverter();
        $recs = iterator_to_array($conv->convert(AVEFI_SAMPLES . "/avefi-native.json"), false);
        $this->assertCount(1, $recs);
        $this->assertSame("Die Reise nach Leonberg", $recs[0]["work"]["title"]);
        $this->assertArrayHasKey("avefi", $recs[0]["source"]);
    }
}
