<?php

class ConverterTest extends \Codeception\Test\Unit
{
    protected $tester;

    private function records(\Converter $conv, string $file): array
    {
        return iterator_to_array($conv->convert($file), false);
    }

    public function testGenericCsv()
    {
        $recs = $this->records(new \converters\GenericCsvConverter(), AVEFI_SAMPLES . "/films.csv");
        $this->assertCount(3, $recs);
        $this->assertSame("Metropolis", $recs[0]["work"]["title"]);
        $this->assertSame(1927, $recs[0]["work"]["year"]);
        $this->assertSame("Spielfilm", $recs[0]["work"]["work_type"]);
    }

    public function testGenericTsv()
    {
        $recs = $this->records(new \converters\GenericCsvConverter("\t"), AVEFI_SAMPLES . "/films.tsv");
        $this->assertCount(3, $recs);
        $this->assertSame("Nosferatu", $recs[1]["work"]["title"]);
    }

    public function testGenericJson()
    {
        $recs = $this->records(new \converters\GenericJsonConverter(), AVEFI_SAMPLES . "/films.json");
        $this->assertCount(3, $recs);
        $this->assertSame("Metropolis", $recs[0]["work"]["title"]);
        $this->assertSame("Dokumentarfilm", $recs[2]["work"]["work_type"]);
    }

    public function testMarcXml()
    {
        $recs = $this->records(new \converters\MarcXmlConverter(), AVEFI_SAMPLES . "/films.marcxml");
        $this->assertCount(3, $recs);
        $this->assertSame("Metropolis", $recs[0]["work"]["title"]);
        $this->assertSame(1927, $recs[0]["work"]["year"]);
        $this->assertSame("Lang, Fritz", $recs[0]["work"]["contributors"][0]["name"]);
        $this->assertSame(153, $recs[0]["manifestations"][0]["duration_min"]);
    }

    public function testEadSkipsCollectionLevel()
    {
        $recs = $this->records(new \converters\EadConverter(), AVEFI_SAMPLES . "/films.ead");
        $this->assertCount(3, $recs);
        $titles = array_map(fn($r) => $r["work"]["title"], $recs);
        $this->assertContains("Metropolis", $titles);
        $this->assertNotContains("Filmsammlung Deutsches Filminstitut", $titles);
    }

    public function testCsvRecordsAreSchemaValid()
    {
        $recs = $this->records(new \converters\GenericCsvConverter(), AVEFI_SAMPLES . "/films.csv");
        foreach ($recs as $r) {
            $this->assertTrue(SchemaValidator::isValid($r), "CSV-Record sollte schema-gültig sein: " . ($r["work"]["title"] ?? "?"));
        }
    }
}
