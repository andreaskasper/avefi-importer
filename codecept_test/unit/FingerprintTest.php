<?php

class FingerprintTest extends \Codeception\Test\Unit
{
    protected $tester;

    public function testCsvFingerprintIsStable()
    {
        $a = Fingerprint::analyze(AVEFI_SAMPLES . "/films.csv", "csv");
        $b = Fingerprint::analyze(AVEFI_SAMPLES . "/films.csv", "csv");
        $this->assertSame($a["fingerprint"], $b["fingerprint"]);
        $this->assertNotEmpty($a["columns"]);
        $this->assertContains("title", array_map("strtolower", $a["columns"]));
    }

    public function testMarcRootDetected()
    {
        $a = Fingerprint::analyze(AVEFI_SAMPLES . "/films.marcxml", "marcxml");
        $this->assertSame("collection", $a["sample"]["root"]);
        $this->assertStringContainsString("marc21", strtolower((string)$a["sample"]["namespace"]));
    }

    public function testEadRootDetected()
    {
        $a = Fingerprint::analyze(AVEFI_SAMPLES . "/films.ead", "ead");
        $this->assertSame("ead", $a["sample"]["root"]);
    }

    public function testJsonKeysFingerprint()
    {
        $a = Fingerprint::analyze(AVEFI_SAMPLES . "/films.json", "json");
        $this->assertNotEmpty($a["fingerprint"]);
        $this->assertContains("title", array_map("strtolower", $a["columns"]));
    }
}
