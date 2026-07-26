<?php

class SchemaValidatorTest extends \Codeception\Test\Unit
{
    protected $tester;

    private function validRecord(): array
    {
        return [
            "work" => [
                "title"             => "Metropolis",
                "titles_additional" => [],
                "year"              => 1927,
                "work_type"         => "Spielfilm",
                "country"           => "Deutschland",
                "genre"             => "Science-Fiction",
                "language"          => "Stumm",
                "description"       => "Dystopische Metropole.",
                "contributors"      => [["role" => "director", "name" => "Fritz Lang"]],
            ],
            "manifestations" => [["carrier" => "35 mm", "duration_min" => 153]],
            "items"          => [["holding_institution" => "DFI", "signature" => "X", "location" => "Tresor"]],
            "source"         => ["file" => "x.csv", "row" => 1],
        ];
    }

    public function testValidRecordPasses()
    {
        $this->assertTrue(SchemaValidator::isValid($this->validRecord()));
        $this->assertSame([], SchemaValidator::validate($this->validRecord()));
    }

    public function testMissingWorkTypeReported()
    {
        $r = $this->validRecord();
        $r["work"]["work_type"] = null;
        $errors = SchemaValidator::validate($r);
        $this->assertNotEmpty($errors);
        $this->assertStringContainsString("work.work_type", implode("\n", $errors));
    }

    public function testInvalidEnumReported()
    {
        $r = $this->validRecord();
        $r["work"]["work_type"] = "Kinofilm";
        $this->assertStringContainsString("unzulässigen Wert", implode("\n", SchemaValidator::validate($r)));
    }

    public function testEmptyTitleIsInvalid()
    {
        $r = $this->validRecord();
        $r["work"]["title"] = "";
        $this->assertFalse(SchemaValidator::isValid($r));
    }

    public function testContributorNeedsName()
    {
        $r = $this->validRecord();
        $r["work"]["contributors"] = [["role" => "director", "name" => ""]];
        $this->assertStringContainsString("contributors[0].name", implode("\n", SchemaValidator::validate($r)));
    }

    public function testYearOutOfRangeIsInvalid()
    {
        $r = $this->validRecord();
        $r["work"]["year"] = 1700;
        $this->assertFalse(SchemaValidator::isValid($r));
    }
}
