<?php

class CompletenessTest extends \Codeception\Test\Unit
{
    protected $tester;

    private function fullRecord(): array
    {
        return [
            "work" => [
                "title" => "Metropolis", "year" => 1927, "work_type" => "Spielfilm",
                "country" => "Deutschland", "genre" => "SciFi", "language" => "Stumm",
                "description" => "…", "contributors" => [["role" => "director", "name" => "Fritz Lang"]],
            ],
            "manifestations" => [["carrier" => "35 mm"]],
            "items"          => [["holding_institution" => "DFI"]],
        ];
    }

    public function testFullRecordIsHundred()
    {
        $this->assertSame(100, Completeness::forRecord($this->fullRecord()));
    }

    public function testMinimalRecordIsLow()
    {
        $c = Completeness::forRecord(["work" => ["title" => "X", "year" => 1927]]);
        $this->assertGreaterThan(0, $c);
        $this->assertLessThan(50, $c);
    }

    public function testRingClassThresholds()
    {
        $this->assertSame("low", Completeness::ringClass(40));
        $this->assertSame("mid", Completeness::ringClass(70));
        $this->assertSame("", Completeness::ringClass(90));
    }

    public function testIssuesFlagMissingRecommended()
    {
        $r = ["work" => ["title" => "X", "year" => 1927, "work_type" => "Spielfilm"]];
        $texts = array_column(Completeness::issues($r), "text");
        $this->assertNotEmpty(array_filter($texts, fn($t) => str_contains($t, "Genre")));
    }

    public function testIssuesReportRequiredComplete()
    {
        $texts = array_column(Completeness::issues($this->fullRecord()), "text");
        $this->assertNotEmpty(array_filter($texts, fn($t) => str_contains($t, "Pflichtfelder Werk vollständig")));
    }
}
