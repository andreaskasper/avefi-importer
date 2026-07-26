<?php

class RecordMapperTest extends \Codeception\Test\Unit
{
    protected $tester;

    public function testClassify()
    {
        $this->assertSame("title", RecordMapper::classify("Filmtitel"));
        $this->assertSame("title", RecordMapper::classify("Haupttitel"));
        $this->assertSame("year", RecordMapper::classify("Entst_Jahr"));
        $this->assertSame("year", RecordMapper::classify("Produktionsjahr"));
        $this->assertSame("director", RecordMapper::classify("Regie"));
        $this->assertSame("work_type", RecordMapper::classify("Werkart"));
        $this->assertSame("carrier", RecordMapper::classify("Format_Träger"));
        $this->assertSame("signature", RecordMapper::classify("Signatur"));
        $this->assertSame("institution", RecordMapper::classify("Institution"));
        $this->assertNull(RecordMapper::classify("Kaffeesorte"));
    }

    public function testHasTitleColumn()
    {
        $this->assertTrue(RecordMapper::hasTitleColumn(["Filmtitel", "Jahr"]));
        $this->assertFalse(RecordMapper::hasTitleColumn(["col_a", "col_b"]));
    }

    public function testFromAssocMapsHierarchy()
    {
        $rec = RecordMapper::fromAssoc([
            "Filmtitel"     => "Nosferatu",
            "Entst_Jahr"    => "1922",
            "Regie"         => "F. W. Murnau",
            "Werkart"       => "Spielfilm",
            "Format_Träger" => "Nitro",
            "Länge_min"     => "94",
            "Signatur"      => "DFI-1922-007",
            "Institution"   => "Deutsches Filminstitut",
            "Standort"      => "Regal 3",
        ], "test.csv", 2);

        $this->assertSame("Nosferatu", $rec["work"]["title"]);
        $this->assertSame(1922, $rec["work"]["year"]);
        $this->assertSame("Spielfilm", $rec["work"]["work_type"]);
        $this->assertSame("director", $rec["work"]["contributors"][0]["role"]);
        $this->assertSame("F. W. Murnau", $rec["work"]["contributors"][0]["name"]);
        $this->assertSame("Nitro", $rec["manifestations"][0]["carrier"]);
        $this->assertSame(94, $rec["manifestations"][0]["duration_min"]);
        $this->assertSame("DFI-1922-007", $rec["items"][0]["signature"]);
        $this->assertSame("Deutsches Filminstitut", $rec["items"][0]["holding_institution"]);
        $this->assertSame(2, $rec["source"]["row"]);
    }

    public function testUnmappedColumnsKeptInExtra()
    {
        $rec = RecordMapper::fromAssoc(["Filmtitel" => "X", "Notizfeld" => "abc"], "f.csv", 1);
        $this->assertSame("abc", $rec["source"]["extra"]["Notizfeld"] ?? null);
    }

    public function testEmptyRowDetection()
    {
        $this->assertTrue(RecordMapper::isEmptyRow(["a" => "", "b" => null]));
        $this->assertFalse(RecordMapper::isEmptyRow(["a" => "x"]));
    }
}
