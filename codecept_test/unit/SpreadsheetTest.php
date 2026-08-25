<?php

/*
 * SpreadsheetTest — Arbeitsmappen lesen. Eine Arbeitsmappe ist keine Tabelle, sondern
 * mehrere; jedes gewählte Blatt wird als CSV herausgelöst und durchläuft danach
 * dieselbe Kette wie eine hochgeladene CSV.
 */
class SpreadsheetTest extends \Codeception\Test\Unit
{
    protected $tester;

    private string $file = "";

    protected function _before()
    {
        if (!Spreadsheet::available()) {
            $this->markTestSkipped("PhpSpreadsheet ist nicht installiert (composer install).");
        }
    }

    protected function _after()
    {
        if ($this->file !== "" && is_file($this->file)) @unlink($this->file);
    }

    /** Erzeugt eine Arbeitsmappe: Deckblatt, zwei Bestände, Legende. */
    private function workbook(): string
    {
        $b = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $d = $b->getActiveSheet();
        $d->setTitle("Deckblatt");
        $d->fromArray([["Bestandsübersicht"]], null, "A1");

        $a = $b->createSheet();
        $a->setTitle("Lehrfilme");
        $a->fromArray([
            ["Titel", "Regie", "Produktionsjahr"],
            ["Quick, das Eichhörnchen", "Heinz Sielmann", "1951"],
            ["Reinecke Fuchs", "H. A. Lettow", "1955"],
        ], null, "A1");
        // Datum als Serienzahl mit Anzeigeformat — ungeformatiert käme eine Zahl heraus.
        $a->setCellValue("D1", "Kopie gezogen am");
        $a->setCellValue("D2", \PhpOffice\PhpSpreadsheet\Shared\Date::stringToExcel("1961-03-12"));
        $a->getStyle("D2")->getNumberFormat()->setFormatCode("DD.MM.YYYY");

        $c = $b->createSheet();
        $c->setTitle("Dokumentarfilme");
        $c->fromArray([["Titel", "Land"], ["Grönland-Expedition", "GRL/DE"]], null, "A1");

        $l = $b->createSheet();
        $l->setTitle("Legende");
        $l->fromArray([["s/w = schwarzweiß"]], null, "A1");

        $this->file = sys_get_temp_dir() . "/avefi_test_" . uniqid() . ".xlsx";
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($b))->save($this->file);
        return $this->file;
    }

    /* ---------- Formate ---------- */

    public function testErkanntWirdWasEineArbeitsmappeIst()
    {
        $this->assertTrue(Spreadsheet::isSpreadsheet("xlsx"));
        $this->assertTrue(Spreadsheet::isSpreadsheet("xls"));
        $this->assertTrue(Spreadsheet::isSpreadsheet("ods"));
        $this->assertFalse(Spreadsheet::isSpreadsheet("csv"));
        $this->assertFalse(Spreadsheet::isSpreadsheet(null));
    }

    /* ---------- Blätter auflisten ---------- */

    public function testBlaetterWerdenAufgelistet()
    {
        $sheets = Spreadsheet::sheets($this->workbook());
        $this->assertSame(["Deckblatt", "Lehrfilme", "Dokumentarfilme", "Legende"],
            array_column($sheets, "name"));
    }

    public function testDeckblattUndLegendeGeltenAlsUnbrauchbar()
    {
        // Arbeitsmappen enthalten regelmäßig Blätter, die niemand importieren will.
        $by = [];
        foreach (Spreadsheet::sheets($this->workbook()) as $s) $by[$s["name"]] = $s["usable"];
        $this->assertFalse($by["Deckblatt"]);
        $this->assertFalse($by["Legende"]);
        $this->assertTrue($by["Lehrfilme"]);
        $this->assertTrue($by["Dokumentarfilme"]);
    }

    /* ---------- Blatt herauslösen ---------- */

    public function testBlattWirdAlsTabelleHerausgeloest()
    {
        $dest = sys_get_temp_dir() . "/avefi_sheet_" . uniqid() . ".csv";
        $info = Spreadsheet::extract($this->workbook(), "Lehrfilme", $dest);

        $this->assertSame(2, $info["rows"]);         // ohne Kopfzeile
        $this->assertGreaterThanOrEqual(3, $info["cols"]);

        $head = TableHeader::read($dest, "csv");
        $this->assertSame(["Titel", "Regie", "Produktionsjahr", "Kopie gezogen am"], $head["columns"]);
        $this->assertSame("Quick, das Eichhörnchen", $head["rows"][0]["Titel"]);
        @unlink($dest);
    }

    public function testDatumBleibtLesbar()
    {
        // Excel legt Daten als Zahl ab; ungeformatiert käme „22351" statt des Datums.
        $dest = sys_get_temp_dir() . "/avefi_sheet_" . uniqid() . ".csv";
        Spreadsheet::extract($this->workbook(), "Lehrfilme", $dest);
        $head = TableHeader::read($dest, "csv");
        $this->assertSame("12.03.1961", $head["rows"][0]["Kopie gezogen am"]);
        @unlink($dest);
    }

    public function testJedesBlattErgibtEineEigeneTabelle()
    {
        $book = $this->workbook();
        $a = sys_get_temp_dir() . "/a_" . uniqid() . ".csv";
        $b = sys_get_temp_dir() . "/b_" . uniqid() . ".csv";
        Spreadsheet::extract($book, "Lehrfilme", $a);
        Spreadsheet::extract($book, "Dokumentarfilme", $b);

        $ha = TableHeader::read($a, "csv");
        $hb = TableHeader::read($b, "csv");
        $this->assertNotSame($ha["hash"], $hb["hash"], "Verschiedene Blätter brauchen verschiedene Profile");
        $this->assertSame(["Titel", "Land"], $hb["columns"]);
        @unlink($a); @unlink($b);
    }

    public function testDateinameEnthaeltDasBlatt()
    {
        $name = Spreadsheet::sheetFilename("Bestand 2026.xlsx", "Lehrfilme");
        $this->assertStringContainsString("Lehrfilme", $name);
        $this->assertStringEndsWith(".csv", $name);
        $this->assertStringNotContainsString("/", $name);
    }
}
