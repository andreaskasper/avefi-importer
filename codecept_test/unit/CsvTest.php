<?php

class CsvTest extends \Codeception\Test\Unit
{
    protected $tester;

    public function testSniffComma()
    {
        $this->assertSame(",", Csv::sniff(AVEFI_SAMPLES . "/films.csv"));
    }

    public function testSniffTab()
    {
        $this->assertSame("\t", Csv::sniff(AVEFI_SAMPLES . "/films.tsv"));
    }

    public function testSniffSemicolon()
    {
        $tmp = tempnam(sys_get_temp_dir(), "csv");
        file_put_contents($tmp, "titel;jahr;regie\nMetropolis;1927;Lang\n");
        $this->assertSame(";", Csv::sniff($tmp));
        unlink($tmp);
    }

    public function testSniffFallback()
    {
        $tmp = tempnam(sys_get_temp_dir(), "csv");
        file_put_contents($tmp, "einspaltig\nwert\n");
        $this->assertSame(",", Csv::sniff($tmp, ","));
        unlink($tmp);
    }
}
