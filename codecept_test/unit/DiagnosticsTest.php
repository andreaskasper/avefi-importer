<?php

/*
 * DiagnosticsTest — JsonLint (Fehlerposition), ParseDiagnostics (JSON/XML/CSV)
 * und FormatGuess (Format-/Schema-Label).
 */
class DiagnosticsTest extends \Codeception\Test\Unit
{
    protected $tester;
    private array $tmp = [];

    protected function _after()
    {
        foreach ($this->tmp as $f) @unlink($f);
        $this->tmp = [];
    }

    private function file(string $content, string $ext): string
    {
        $p = sys_get_temp_dir() . "/avefi_test_" . substr(md5($content . $ext), 0, 12) . "." . $ext;
        file_put_contents($p, $content);
        $this->tmp[] = $p;
        return $p;
    }

    /* ---------- JsonLint ---------- */

    public function testJsonLintValidReturnsNull()
    {
        $this->assertNull(\JsonLint::locate('[{"a":1},{"b":2}]'));
    }

    public function testJsonLintTrailingComma()
    {
        $r = \JsonLint::locate("[\n  {\"a\":1},\n]");
        $this->assertNotNull($r);
        $this->assertSame(3, $r["line"]);
        $this->assertStringContainsString("Komma", $r["message"]);
    }

    public function testJsonLintUnterminatedString()
    {
        $r = \JsonLint::locate('{"title":"Metropolis}');
        $this->assertNotNull($r);
        $this->assertSame(1, $r["line"]);
        $this->assertStringContainsString("Zeichenkette", $r["message"]);
    }

    public function testJsonLintMissingColonPosition()
    {
        $r = \JsonLint::locate('{"a" 1}');
        $this->assertSame(1, $r["line"]);
        $this->assertSame(6, $r["column"]);
    }

    /* ---------- ParseDiagnostics ---------- */

    public function testDiagJsonBrokenHasSnippet()
    {
        $d = \ParseDiagnostics::analyze($this->file('[{"a":1},]', "json"), "json");
        $this->assertFalse($d["ok"]);
        $this->assertNotEmpty($d["errors"]);
        $this->assertNotNull($d["errors"][0]["snippet"]);
        $this->assertNotSame("", $d["errors"][0]["hint"]);
    }

    public function testDiagJsonValid()
    {
        $d = \ParseDiagnostics::analyze(AVEFI_SAMPLES . "/avefi-native.json", "json");
        $this->assertTrue($d["ok"]);
        $this->assertSame([], $d["errors"]);
    }

    public function testDiagXmlBrokenReportsLine()
    {
        $xml = "<collection><record><title>X</title><record></collection>";
        $d = \ParseDiagnostics::analyze($this->file($xml, "xml"), "marcxml");
        $this->assertFalse($d["ok"]);
        $this->assertNotEmpty($d["errors"]);
        $this->assertNotNull($d["errors"][0]["line"]);
    }

    public function testDiagCsvNoTitleColumnIsWarning()
    {
        $d = \ParseDiagnostics::analyze($this->file("jahr;land\n1927;DE\n", "csv"), "csv");
        $this->assertTrue($d["ok"]);   // lesbar, nur kein Titel → Warnung
        $this->assertSame("warn", $d["errors"][0]["severity"]);
        $this->assertStringContainsString("Titel", $d["errors"][0]["message"]);
    }

    /* ---------- FormatGuess ---------- */

    public function testFormatGuessNativeAvefi()
    {
        $a = \Fingerprint::analyze(AVEFI_SAMPLES . "/avefi-native.json", "json");
        $g = \FormatGuess::jsonSchema($a["columns"], $a["sample"]);
        $this->assertSame("avefi_json_v1", $g["key"]);
        $this->assertSame("AVefi (nativ)", \FormatGuess::describe("json", $a, true));
    }

    public function testFormatGuessGenericJson()
    {
        $a = \Fingerprint::analyze(AVEFI_SAMPLES . "/films.json", "json");
        $this->assertSame("Objektliste (JSON)", \FormatGuess::describe("json", $a, true));
    }

    public function testFormatGuessBrokenLabel()
    {
        $this->assertSame("JSON (fehlerhaft)", \FormatGuess::describe("json", [], false));
    }

    public function testFormatGuessMarcXml()
    {
        $a = \Fingerprint::analyze(AVEFI_SAMPLES . "/films.marcxml", "marcxml");
        $this->assertSame("MARC-XML", \FormatGuess::describe("marcxml", $a, true));
    }
}
